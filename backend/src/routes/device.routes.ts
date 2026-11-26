import { Router } from 'express';
import {
  createDeviceSchema,
  createRelaySchema,
  deviceIoConfigSchema,
  relayScheduleSchema,
  triggerOtaSchema,
  updateDeviceSchema,
  updateRelaySchema,
} from '@sem/shared';
import { z } from 'zod';
import { DeviceService } from '../services/device.service.js';
import { FirmwareService } from '../services/firmware.service.js';
import { RelayService } from '../services/relay.service.js';
import { TelemetryService } from '../services/telemetry.service.js';

export function createDeviceRouter(
  deviceService: DeviceService,
  telemetryService: TelemetryService,
  mqttPublisher?: (deviceId: string, config: Record<string, unknown>) => void,
  firmwareService?: FirmwareService,
  relayService?: RelayService,
  mqttCommandPublisher?: (deviceId: string, command: string, params?: Record<string, unknown>) => void,
) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const devices = await deviceService.listDevices(req.user!.id, req.user!.role);
      res.json({ devices });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createDeviceSchema.parse(req.body);
      const created = await deviceService.createDevice(req.user!.id, parsed);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const row = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const sensorConfig = await deviceService.getSensorConfig(row.id, row.device_id);
      const latest = await telemetryService.getLatest(row.id);
      res.json({
        device: {
          id: row.id,
          deviceId: row.device_id,
          ownerUserId: row.owner_user_id,
          name: row.name,
          locationLabel: row.location_label,
          serviceCategory: row.service_category,
          consumerEligibleForSubsidy: row.consumer_eligible_for_subsidy,
          meterSerialNumber: row.meter_serial_number,
          firmwareVersion: row.firmware_version,
          hardwareVersion: row.hardware_version,
          telemetryIntervalSec: row.telemetry_interval_sec,
          monitoringMode: row.monitoring_mode,
          isOnline: Boolean(row.is_online),
          wifiRssiDbm: row.wifi_rssi_dbm ?? null,
          lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        },
        sensorConfig,
        latest,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const basePatch = updateDeviceSchema.parse(req.body);
      const extra = z
        .object({
          sensorConfig: z
            .object({
              voltageCalibrationFactor: z.number().positive().max(10).optional(),
              currentCalibrationFactor: z.number().positive().max(10).optional(),
              phaseCorrectionDeg: z.number().min(-30).max(30).optional(),
              calibrationStatus: z
                .enum(['verified', 'pending', 'factory_default', 'recalibration_due'])
                .optional(),
            })
            .optional(),
        })
        .parse(req.body);

      const updated = await deviceService.updateDevice(req.params.id, req.user!.id, req.user!.role, {
        ...basePatch,
        ...extra,
      });

      if (mqttPublisher && (basePatch.telemetryIntervalSec !== undefined || extra.sensorConfig)) {
        mqttPublisher(updated.deviceId, {
          telemetry_interval_sec: updated.telemetryIntervalSec,
          ...(extra.sensorConfig ? { calibration: extra.sensorConfig } : {}),
        });
      }

      res.json({ device: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await deviceService.deleteDevice(req.params.id, req.user!.id, req.user!.role);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Telemetry & Energy nested endpoints on /api/devices/:id/*
  router.get('/:id/latest', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const [latest, sensorConfig] = await Promise.all([
        telemetryService.getLatest(dev.id),
        deviceService.getSensorConfig(dev.id, dev.device_id),
      ]);
      res.json({ latest, sensorConfig });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/telemetry', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const days = req.query.days ? Number(req.query.days) : 1;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const data = await telemetryService.getHistory(dev.id, { days, startDate, endDate });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/history', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const days = req.query.days ? Number(req.query.days) : 1;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const data = await telemetryService.getHistory(dev.id, { days, startDate, endDate });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/energy', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const counter = await telemetryService.getEnergyCounter(dev.id);
      res.json({ deviceId: dev.device_id, counter });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/energy/daily', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const days = req.query.days ? Number(req.query.days) : 30;
      const daily = await telemetryService.getDailyRollups(dev.id, days);
      res.json({ deviceId: dev.device_id, daily });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/energy/monthly', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const monthly = await telemetryService.getMonthlyRollups(dev.id);
      res.json({ deviceId: dev.device_id, monthly });
    } catch (err) {
      next(err);
    }
  });

  // --- I/O & LED Indicator Configuration (RGB / Single Status LED + Pulse LED + Offline Buffer) ---
  router.get('/:id/io-config', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const ioConfig = await deviceService.getIoConfig(dev.id, dev.device_id);
      res.json({ ioConfig });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/io-config', async (req, res, next) => {
    try {
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = deviceIoConfigSchema.parse(req.body);
      const ioConfig = await deviceService.updateIoConfig(dev.id, dev.device_id, parsed);
      if (mqttPublisher) {
        mqttPublisher(dev.device_id, {
          led_config: {
            status_mode: ioConfig.statusLedMode,
            rgb_gpio: ioConfig.statusRgbGpio,
            single_gpio: ioConfig.statusSingleLedGpio,
            pulse_enabled: ioConfig.pulseLedEnabled,
            pulse_gpio: ioConfig.pulseLedGpio,
            imp_per_kwh: ioConfig.pulseImpPerKwh,
          },
          offline_buffer_enabled: ioConfig.offlineBufferEnabled,
        });
      }
      res.json({ ioConfig });
    } catch (err) {
      next(err);
    }
  });

  // --- Multi-Relay & Offline Scheduling ---
  const publishRelaySync = async (deviceUuid: string, deviceCode: string) => {
    if (!relayService || !mqttPublisher) return;
    const relays = await relayService.listRelays(deviceUuid, deviceCode);
    mqttPublisher(deviceCode, relayService.buildMqttSyncPayload(relays));
  };

  router.get('/:id/relays', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const relays = await relayService.listRelays(dev.id, dev.device_id);
      res.json({ relays });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/relays', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = createRelaySchema.parse(req.body);
      const relay = await relayService.addRelay(dev.id, dev.device_id, parsed);
      await publishRelaySync(dev.id, dev.device_id);
      res.status(201).json({ relay });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/relays/:relayId', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = updateRelaySchema.parse(req.body);
      const relay = await relayService.updateRelay(dev.id, dev.device_id, req.params.relayId, parsed);
      if (parsed.currentState !== undefined && mqttCommandPublisher) {
        mqttCommandPublisher(dev.device_id, 'set_relay', {
          ch: relay.channelIndex,
          state: relay.currentState,
        });
      }
      await publishRelaySync(dev.id, dev.device_id);
      res.json({ relay });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/relays/:relayId', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      await relayService.deleteRelay(dev.id, req.params.relayId);
      await publishRelaySync(dev.id, dev.device_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/relays/:relayId/schedules', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = relayScheduleSchema.parse(req.body);
      const schedule = await relayService.addSchedule(dev.id, dev.device_id, req.params.relayId, parsed);
      await publishRelaySync(dev.id, dev.device_id);
      res.status(201).json({ schedule });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/relays/:relayId/schedules/:scheduleId', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = relayScheduleSchema.partial().parse(req.body);
      await relayService.updateSchedule(dev.id, req.params.relayId, req.params.scheduleId, parsed);
      await publishRelaySync(dev.id, dev.device_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/relays/:relayId/schedules/:scheduleId', async (req, res, next) => {
    try {
      if (!relayService) throw new Error('Relay service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      await relayService.deleteSchedule(dev.id, req.params.relayId, req.params.scheduleId);
      await publishRelaySync(dev.id, dev.device_id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // --- GitHub FOTA Firmware Status & Install/Update Trigger ---
  router.get('/:id/firmware', async (req, res, next) => {
    try {
      if (!firmwareService) throw new Error('Firmware service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const firmware = await firmwareService.getDeviceFirmwareStatus(dev.id, dev.firmware_version);
      res.json(firmware);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/ota', async (req, res, next) => {
    try {
      if (!firmwareService) throw new Error('Firmware service not initialized');
      const dev = await deviceService.resolveAuthorizedDevice(req.params.id, req.user!.id, req.user!.role);
      const parsed = triggerOtaSchema.parse(req.body ?? {});
      const job = await firmwareService.triggerOta({
        deviceUuid: dev.id,
        deviceCode: dev.device_id,
        userId: req.user!.id,
        targetVersion: parsed.targetVersion,
        binaryUrl: parsed.binaryUrl,
        checksumSha256: parsed.checksumSha256,
      });
      if (mqttCommandPublisher) {
        mqttCommandPublisher(dev.device_id, 'ota_update', {
          job_id: job.id,
          version: job.targetVersion,
          url: job.binaryUrl,
        });
      }
      res.status(202).json({ job });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
