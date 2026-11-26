import fs from 'node:fs';
import mqtt, { MqttClient } from 'mqtt';
import { mqttTelemetryPayloadSchema, OtaJobStatus } from '@sem/shared';
import { AlertService } from '../services/alert.service.js';
import { FirmwareService } from '../services/firmware.service.js';
import { RelayService } from '../services/relay.service.js';
import { TelemetryService } from '../services/telemetry.service.js';

export interface MqttWorkerOptions {
  brokerUrl: string;
  username?: string | null;
  password?: string | null;
  clientId?: string;
  caCertPath?: string | null;
  rejectUnauthorized?: boolean;
}

export class MqttIngestionWorker {
  private client: MqttClient | null = null;
  private isConnected = false;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly alertService: AlertService,
    private readonly options: MqttWorkerOptions,
    private readonly firmwareService?: FirmwareService,
    private readonly relayService?: RelayService,
  ) {}

  async start(): Promise<void> {
    const ca =
      this.options.caCertPath && fs.existsSync(this.options.caCertPath)
        ? fs.readFileSync(this.options.caCertPath)
        : undefined;

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(this.options.brokerUrl, {
        clientId: this.options.clientId || `sem-ingestor-${Date.now()}`,
        username: this.options.username || undefined,
        password: this.options.password || undefined,
        clean: true,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
        ca,
        rejectUnauthorized: this.options.rejectUnauthorized ?? true,
      });

      this.client = client;

      client.once('connect', () => {
        this.isConnected = true;
        client.subscribe(
          ['energy/+/telemetry', 'energy/+/status', 'energy/+/alerts'],
          { qos: 1 },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });

      client.on('reconnect', () => {
        this.isConnected = false;
      });

      client.on('offline', () => {
        this.isConnected = false;
      });

      client.on('error', (err) => {
        if (!this.isConnected) {
          reject(err);
        } else if (process.env.NODE_ENV !== 'test') {
          console.error('[MQTT Error]', err.message);
        }
      });

      client.on('message', (topic, payloadBuf) => {
        void this.handleMessage(topic, payloadBuf.toString('utf8'));
      });
    });
  }

  async handleMessage(topic: string, rawPayload: string): Promise<void> {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'energy') return;
    const topicDeviceId = parts[1].toUpperCase();
    const channel = parts[2];

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      return;
    }

    if (channel === 'telemetry') {
      const parsed = mqttTelemetryPayloadSchema.safeParse(json);
      if (!parsed.success) return;

      // Topic-level authorization/anti-spoofing: topic device must match payload device_id
      if (parsed.data.device_id.toUpperCase() !== topicDeviceId) {
        return;
      }

      try {
        const res = await this.telemetryService.ingest({
          deviceId: topicDeviceId,
          voltageRms: parsed.data.voltage_rms,
          currentRms: parsed.data.current_rms,
          activePowerW: parsed.data.active_power,
          apparentPowerVa: parsed.data.apparent_power,
          powerFactor: parsed.data.power_factor,
          frequencyHz: parsed.data.frequency,
          energyKwh: parsed.data.energy_kwh,
          deviceTimestamp: parsed.data.timestamp,
          wifiRssiDbm: parsed.data.wifi_rssi,
          seq: parsed.data.seq,
          buffered: parsed.data.buffered,
        });
        if (res.accepted && res.point && !parsed.data.buffered) {
          await this.alertService.evaluateTelemetry(res.point);
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[MQTT Telemetry Rejected]', topicDeviceId, err instanceof Error ? err.message : err);
        }
      }
      return;
    }

    if (channel === 'status') {
      const status = String(json.status || '').toLowerCase();
      if (status === 'offline') {
        await this.telemetryService.markDeviceOffline(topicDeviceId, String(json.reason || 'MQTT_LWT'));
        await this.alertService.createOfflineAlert(topicDeviceId, 2);
      }

      if (this.firmwareService && typeof json.ota_status === 'string') {
        await this.firmwareService.updateJobProgressFromDevice(topicDeviceId, {
          jobId: typeof json.ota_job_id === 'string' ? json.ota_job_id : undefined,
          status: json.ota_status as OtaJobStatus,
          progressPct: typeof json.ota_progress === 'number' ? json.ota_progress : undefined,
          version: typeof json.version === 'string' ? json.version : undefined,
          errorMessage: typeof json.ota_error === 'string' ? json.ota_error : undefined,
        });
      }

      if (this.relayService && Array.isArray(json.relays)) {
        const states = json.relays
          .filter((r): r is { ch: number; state: boolean } => Boolean(r && typeof r === 'object'))
          .map((r) => ({ channel: Number(r.ch), state: Boolean(r.state) }));
        if (states.length > 0) {
          await this.relayService.syncReportedRelayStates(topicDeviceId, states);
        }
      }
    }
  }

  publishDeviceConfig(deviceId: string, config: Record<string, unknown>): void {
    if (!this.client || !this.isConnected) return;
    this.client.publish(
      `energy/${deviceId.toUpperCase()}/config`,
      JSON.stringify({ ...config, updated_at: new Date().toISOString() }),
      { qos: 1, retain: true },
    );
  }

  publishDeviceCommand(deviceId: string, command: string, params: Record<string, unknown> = {}): void {
    if (!this.client || !this.isConnected) return;
    this.client.publish(
      `energy/${deviceId.toUpperCase()}/command`,
      JSON.stringify({ command, params, issued_at: new Date().toISOString() }),
      { qos: 1 },
    );
  }

  getStatus() {
    return {
      connected: this.isConnected,
      brokerUrl: this.options.brokerUrl,
    };
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => {
      this.client?.end(true, {}, () => resolve());
    });
    this.isConnected = false;
  }
}
