import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/db/database.js';

const TEST_ENV = {
  nodeEnv: 'test',
  port: 4000,
  corsOrigins: ['http://localhost:3000'],
  databaseUrl: null,
  supabaseUrl: null,
  supabaseAnonKey: null,
  supabaseServiceRoleKey: null,
  jwtSecret: 'integration-test-secret-key-2026',
  mqttEnabled: false,
  mqttBrokerUrl: null,
  mqttUsername: null,
  mqttPassword: null,
  mqttClientId: 'test-client',
  mqttCaCertPath: null,
  mqttRejectUnauthorized: false,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 1000,
  authRateLimitMax: 1000,
  githubFirmwareRepo: 'smart-energy-monitor/esp32s3-firmware',
  githubToken: null,
};

test('End-to-End Backend API: Auth, Multi-Device Ownership, Telemetry, Manual Reading, TNEB Billing, Alerts & Reports', async () => {
  const db = await createDatabaseClient({ databaseUrl: null });
  const { app, services } = createApp({ db, env: TEST_ENV });

  // 1. Register User A & User B
  const regA = await request(app).post('/api/auth/register').send({
    fullName: 'Alice Resident',
    email: 'alice@example.com',
    mobileNumber: '9876500001',
    password: 'Password123!',
    acceptedTerms: true,
  });
  assert.equal(regA.status, 201);
  const tokenA = regA.body.token as string;
  assert.ok(tokenA);
  assert.equal(regA.body.user.role, 'user');

  const regB = await request(app).post('/api/auth/register').send({
    fullName: 'Bob Neighbor',
    email: 'bob@example.com',
    mobileNumber: '9876500002',
    password: 'Password123!',
    acceptedTerms: true,
  });
  assert.equal(regB.status, 201);
  const tokenB = regB.body.token as string;

  // Login by mobile number
  const loginMobile = await request(app).post('/api/auth/login').send({
    identifier: '9876500001',
    password: 'Password123!',
  });
  assert.equal(loginMobile.status, 200);

  // 2. Pair DEVICE001 for Alice
  const pairRes = await request(app)
    .post('/api/devices')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      deviceId: 'DEVICE001',
      name: 'Alice Main Panel',
      locationLabel: 'Chennai Home',
      consumerEligibleForSubsidy: true,
    });
  assert.equal(pairRes.status, 201);
  assert.equal(pairRes.body.device.deviceId, 'DEVICE001');
  assert.ok(pairRes.body.mqttProvisioning.oneTimeSecret);

  // User B MUST be blocked (403) from reading or modifying Alice's device
  const crossUserRead = await request(app)
    .get('/api/devices/DEVICE001')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(crossUserRead.status, 403);

  // Normal user cannot write raw calibration constants
  const nonAdminCal = await request(app)
    .patch('/api/devices/DEVICE001')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ sensorConfig: { voltageCalibrationFactor: 1.5 } });
  assert.equal(nonAdminCal.status, 403);

  // 3. Create Alert Rule & Ingest Telemetry
  const ruleRes = await request(app)
    .post('/api/alerts/rules')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      deviceId: 'DEVICE001',
      alertType: 'high_power',
      thresholdValue: 2000,
      comparisonOperator: 'gt',
      severity: 'warning',
      enabled: true,
      pushEnabled: true,
    });
  assert.equal(ruleRes.status, 201);

  const t1 = await services.telemetryService.ingest({
    deviceId: 'DEVICE001',
    voltageRms: 230.0,
    currentRms: 5.0,
    activePowerW: 1035.0,
    apparentPowerVa: 1150.0,
    powerFactor: 0.9,
    frequencyHz: 50.0,
    energyKwh: 100.0,
    deviceTimestamp: '2026-11-25T09:00:00+05:30',
    wifiRssiDbm: -55,
  });
  assert.equal(t1.accepted, true);
  if (t1.point) await services.alertService.evaluateTelemetry(t1.point);

  const t2 = await services.telemetryService.ingest({
    deviceId: 'DEVICE001',
    voltageRms: 229.5,
    currentRms: 11.2,
    activePowerW: 2450.0,
    apparentPowerVa: 2570.0,
    powerFactor: 0.95,
    frequencyHz: 50.02,
    energyKwh: 410.0,
    deviceTimestamp: '2026-11-25T10:00:00+05:30',
    wifiRssiDbm: -56,
  });
  assert.equal(t2.accepted, true);
  if (t2.point) await services.alertService.evaluateTelemetry(t2.point);

  // Counter rollover / reset protection: device reports 15.0 after 410.0 -> lifetime becomes 425.0!
  const t3 = await services.telemetryService.ingest({
    deviceId: 'DEVICE001',
    voltageRms: 231.0,
    currentRms: 4.0,
    activePowerW: 880.0,
    apparentPowerVa: 924.0,
    powerFactor: 0.95,
    frequencyHz: 50.0,
    energyKwh: 15.0,
    deviceTimestamp: '2026-11-25T11:00:00+05:30',
  });
  assert.equal(t3.counterResetDetected, true);
  assert.equal(t3.effectiveLifetimeKwh, 425.0);

  // Verify alert triggered for 2450W > 2000W
  const alertsRes = await request(app).get('/api/alerts').set('Authorization', `Bearer ${tokenA}`);
  assert.equal(alertsRes.status, 200);
  assert.equal(alertsRes.body.alerts.length, 1);

  // 4. Energy daily/monthly & History
  const histRes = await request(app)
    .get('/api/devices/DEVICE001/history?days=7')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(histRes.status, 200);
  assert.equal(histRes.body.points.length, 3);
  assert.equal(histRes.body.summary.peakPowerW, 2450);

  const dailyRes = await request(app)
    .get('/api/devices/DEVICE001/energy/daily')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(dailyRes.status, 200);
  assert.equal(dailyRes.body.daily.length, 1);
  assert.equal(dailyRes.body.daily[0].consumedKwh, 325);

  // 5. Manual EB Meter Reading & Discrepancy Comparison + Billing Calculation (350 units -> ₹705.00)
  const mrRes = await request(app)
    .post('/api/billing/manual-reading')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      deviceId: 'DEVICE001',
      previousReading: 1000,
      previousReadingDate: '2026-11-01',
      currentReading: 1350,
      currentReadingDate: '2026-11-25',
      preferredSource: 'manual_eb_meter',
    });
  assert.equal(mrRes.status, 201);
  assert.equal(mrRes.body.reading.unitsConsumed, 350);
  assert.equal(mrRes.body.comparison.disagrees, true); // 325 auto vs 350 manual
  assert.equal(mrRes.body.billing.calculation.totalEstimatedAmountInr, 705);

  // Record actual bill amount
  const cycleId = mrRes.body.billing.cycle.id;
  const actualRes = await request(app)
    .patch(`/api/billing/${cycleId}/actual`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ actualBillAmountInr: 720.0, officialBillNumber: 'TN-2026-991' });
  assert.equal(actualRes.status, 200);
  assert.equal(actualRes.body.cycle.varianceAmountInr, 15);

  // 6. Reports CSV & PDF Export
  const csvRes = await request(app)
    .get('/api/reports/csv?deviceId=DEVICE001&type=electrical_parameters')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.text, /Voltage RMS \(V\)/);

  const pdfRes = await request(app)
    .get('/api/reports/pdf?deviceId=DEVICE001&type=billing_period')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(Buffer.isBuffer(pdfRes.body));
  assert.ok(pdfRes.body.subarray(0, 4).toString('utf8') === '%PDF');

  // 7. Admin seeding & Admin endpoints (tariff management, device assignment, status)
  const adminHash = await bcrypt.hash('AdminSecret123!', 10);
  await db.query(
    `INSERT INTO users (full_name, email, mobile_number, password_hash, role)
     VALUES ('System Admin', 'admin@sem.local', '9999999999', $1, 'admin')`,
    [adminHash],
  );
  const adminLogin = await request(app).post('/api/auth/login').send({
    identifier: 'admin@sem.local',
    password: 'AdminSecret123!',
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.token as string;

  // Normal user forbidden from admin endpoint
  const forbidRes = await request(app).get('/api/admin/status').set('Authorization', `Bearer ${tokenA}`);
  assert.equal(forbidRes.status, 403);

  const adminStatus = await request(app)
    .get('/api/admin/status')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(adminStatus.status, 200);
  assert.equal(adminStatus.body.counts.devices, 1);

  // 8. Relays (Confirmed CH1 + Add CH2 + Offline Schedule) & LED IO Config
  const relaysRes = await request(app)
    .get('/api/devices/DEVICE001/relays')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(relaysRes.status, 200);
  assert.equal(relaysRes.body.relays.length, 1);
  assert.equal(relaysRes.body.relays[0].isConfirmedDefault, true);

  // Reserved SPI GPIO 11 must be rejected
  const badGpio = await request(app)
    .post('/api/devices/DEVICE001/relays')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ name: 'Bad Pin', gpioPin: 11 });
  assert.equal(badGpio.status, 400);

  const addRelay = await request(app)
    .post('/api/devices/DEVICE001/relays')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ name: 'Garden Pump Relay', gpioPin: 5, activeHigh: true, failSafeState: false });
  assert.equal(addRelay.status, 201);
  assert.equal(addRelay.body.relay.channelIndex, 2);

  const addSched = await request(app)
    .post(`/api/devices/DEVICE001/relays/${addRelay.body.relay.id}/schedules`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({
      label: 'Morning Pump',
      startTimeIst: '06:00',
      stopTimeIst: '06:30',
      daysOfWeek: [1, 3, 5],
      enabled: true,
    });
  assert.equal(addSched.status, 201);

  const ioPatch = await request(app)
    .patch('/api/devices/DEVICE001/io-config')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ statusLedMode: 'single_gpio', statusSingleLedGpio: 2, pulseLedEnabled: true, pulseLedGpio: 21 });
  assert.equal(ioPatch.status, 200);
  assert.equal(ioPatch.body.ioConfig.statusLedMode, 'single_gpio');

  // 9. GitHub Releases FOTA registration & device OTA trigger
  const regFw = await request(app)
    .post('/api/admin/firmware/releases')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      version: '1.4.0',
      binaryUrl: 'https://github.com/smart-energy-monitor/esp32s3-firmware/releases/download/v1.4.0/sem.bin',
      releaseNotes: 'GitHub FOTA test release',
    });
  assert.equal(regFw.status, 201);

  const devFw = await request(app)
    .get('/api/devices/DEVICE001/firmware')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(devFw.status, 200);
  assert.equal(devFw.body.updateAvailable, true);
  assert.equal(devFw.body.latestRelease.version, '1.4.0');

  const triggerOta = await request(app)
    .post('/api/devices/DEVICE001/ota')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({});
  assert.equal(triggerOta.status, 202);
  assert.equal(triggerOta.body.job.targetVersion, '1.4.0');

  // 10. Out-of-order offline buffered telemetry backfill does NOT trigger false counter reset
  const backfill = await services.telemetryService.ingest({
    deviceId: 'DEVICE001',
    voltageRms: 230.0,
    currentRms: 3.0,
    activePowerW: 650.0,
    apparentPowerVa: 690.0,
    powerFactor: 0.94,
    frequencyHz: 50.0,
    energyKwh: 85.0,
    deviceTimestamp: '2026-11-25T08:00:00+05:30',
    buffered: true,
  });
  assert.equal(backfill.accepted, true);
  assert.equal(backfill.counterResetDetected, false);

  // Logout invalidates token
  const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${tokenA}`);
  assert.equal(logoutRes.status, 200);
  const afterLogout = await request(app).get('/api/devices').set('Authorization', `Bearer ${tokenA}`);
  assert.equal(afterLogout.status, 401);

  await db.close();
});
