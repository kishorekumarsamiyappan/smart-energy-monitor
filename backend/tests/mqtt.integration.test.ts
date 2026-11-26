import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import Aedes from 'aedes';
import mqtt from 'mqtt';
import { createDatabaseClient } from '../src/db/database.js';
import { MqttIngestionWorker } from '../src/mqtt/mqtt-worker.js';
import { AlertService } from '../src/services/alert.service.js';
import { AuthService } from '../src/services/auth.service.js';
import { DeviceService } from '../src/services/device.service.js';
import { FirmwareService } from '../src/services/firmware.service.js';
import { RelayService } from '../src/services/relay.service.js';
import { TelemetryService } from '../src/services/telemetry.service.js';

test('MQTT Broker Integration: Telemetry ingestion, buffered backfill, FOTA/Relay status, anti-spoofing & LWT offline status', async () => {
  const db = await createDatabaseClient({ databaseUrl: null });
  const authService = new AuthService(db, 'mqtt-test-secret');
  const deviceService = new DeviceService(db);
  const telemetryService = new TelemetryService(db);
  const alertService = new AlertService(db);
  const firmwareService = new FirmwareService(db, 'smart-energy-monitor/esp32s3-firmware');
  const relayService = new RelayService(db);

  const { user } = await authService.register({
    fullName: 'MQTT Owner',
    email: 'mqtt@example.com',
    mobileNumber: '9876511111',
    password: 'Password123!',
  });
  await deviceService.createDevice(user.id, {
    deviceId: 'DEVICE001',
    name: 'Test ESP32-S3',
  });

  // Start embedded Aedes MQTT broker on random free TCP port
  const broker = new Aedes();
  const server = net.createServer(broker.handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as net.AddressInfo;
  const brokerUrl = `mqtt://127.0.0.1:${addr.port}`;

  const worker = new MqttIngestionWorker(
    telemetryService,
    alertService,
    {
      brokerUrl,
      clientId: 'sem-test-ingestor',
    },
    firmwareService,
    relayService,
  );
  await worker.start();
  assert.equal(worker.getStatus().connected, true);

  // Connect simulated ESP32-S3 MQTT client with LWT offline message (disable reconnect so LWT isn't overridden)
  const deviceClient = mqtt.connect(brokerUrl, {
    clientId: 'DEVICE001',
    reconnectPeriod: 0,
    keepalive: 2,
    will: {
      topic: 'energy/DEVICE001/status',
      payload: Buffer.from(JSON.stringify({ device_id: 'DEVICE001', status: 'offline', reason: 'LWT' })),
      qos: 1,
      retain: true,
    },
  });
  await new Promise<void>((resolve) => deviceClient.once('connect', () => resolve()));

  const payload = {
    device_id: 'DEVICE001',
    voltage_rms: 230.0,
    current_rms: 5.0,
    active_power: 1035.0,
    apparent_power: 1150.0,
    power_factor: 0.9,
    frequency: 50.0,
    energy_kwh: 12.5,
    timestamp: '2026-11-25T09:00:00+05:30',
    wifi_rssi: -52,
  };

  // Publish valid packet + duplicate packet + spoofed topic packet
  deviceClient.publish('energy/DEVICE001/telemetry', JSON.stringify(payload), { qos: 1 });
  deviceClient.publish('energy/DEVICE001/telemetry', JSON.stringify(payload), { qos: 1 });
  deviceClient.publish(
    'energy/DEVICE002/telemetry',
    JSON.stringify({ ...payload, device_id: 'DEVICE001', timestamp: '2026-11-25T09:01:00+05:30' }),
    { qos: 1 },
  );

  // Poll briefly up to 2s for async MQTT ingestion into PostgreSQL
  for (let i = 0; i < 20; i++) {
    const dev = await deviceService.resolveAuthorizedDevice('DEVICE001', user.id, 'user');
    const latest = await telemetryService.getLatest(dev.id);
    if (latest) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const dev = await deviceService.resolveAuthorizedDevice('DEVICE001', user.id, 'user');
  const hist = await telemetryService.getHistory(dev.id, { days: 30 });
  assert.equal(hist.points.length, 1); // Duplicate & spoofed topic rejected!
  assert.equal(hist.points[0].energyKwh, 12.5);
  assert.equal(dev.is_online, true);

  // Verify status topic updates OTA version and offline-executed relay state
  await firmwareService.registerRelease({
    version: '1.5.0',
    binaryUrl: 'https://github.com/smart-energy-monitor/esp32s3-firmware/releases/download/v1.5.0/sem.bin',
  });
  const otaJob = await firmwareService.triggerOta({
    deviceUuid: dev.id,
    deviceCode: 'DEVICE001',
    userId: user.id,
  });
  deviceClient.publish(
    'energy/DEVICE001/status',
    JSON.stringify({
      device_id: 'DEVICE001',
      status: 'online',
      ota_job_id: otaJob.id,
      ota_status: 'succeeded',
      ota_progress: 100,
      version: '1.5.0',
      relays: [{ ch: 1, state: true }],
    }),
    { qos: 1 },
  );

  for (let i = 0; i < 20; i++) {
    const relays = await relayService.listRelays(dev.id, 'DEVICE001');
    if (relays[0].currentState) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const updatedDev = await deviceService.resolveAuthorizedDevice('DEVICE001', user.id, 'user');
  assert.equal(updatedDev.firmware_version, '1.5.0');
  const updatedRelays = await relayService.listRelays(dev.id, 'DEVICE001');
  assert.equal(updatedRelays[0].currentState, true);

  // Simulate abrupt disconnect -> broker fires LWT -> backend marks device offline
  deviceClient.stream.destroy();
  for (let i = 0; i < 25; i++) {
    const updated = await deviceService.resolveAuthorizedDevice('DEVICE001', user.id, 'user');
    if (!updated.is_online) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const afterLwt = await deviceService.resolveAuthorizedDevice('DEVICE001', user.id, 'user');
  assert.equal(afterLwt.is_online, false);

  deviceClient.end(true);
  await worker.stop();
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => {
    broker.close(() => server.close(() => resolve()));
  });
  await db.close();
});
