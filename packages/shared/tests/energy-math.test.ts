import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateDemoAlerts,
  generateDemoBillingEstimate,
  generateDemoTelemetrySeries,
  isTelemetryStale,
  summarizeTelemetry,
  validateTelemetryValues,
} from '../src/index.js';

test('Telemetry validation accepts physical single-phase values and rejects invalid ones', () => {
  const ok = validateTelemetryValues({
    voltageRms: 230.2,
    currentRms: 5.1,
    activePowerW: 1050,
    apparentPowerVa: 1174,
    powerFactor: 0.89,
    frequencyHz: 50.01,
    energyKwh: 12.5,
  });
  assert.equal(ok.valid, true);

  const bad = validateTelemetryValues({
    voltageRms: 950,
    currentRms: -1,
    activePowerW: 5000,
    apparentPowerVa: 1000,
    powerFactor: 1.5,
    frequencyHz: 85,
    energyKwh: -2,
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.reasons.length >= 6);
});

test('Telemetry stale detection flags old timestamps', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  assert.equal(isTelemetryStale('2026-11-25T11:59:30Z', now, 120), false);
  assert.equal(isTelemetryStale('2026-11-25T11:55:00Z', now, 120), true);
  assert.equal(isTelemetryStale(null, now, 120), true);
});

test('Telemetry summary computes min/max/avg/peak and handles counter reset gracefully', () => {
  const points = [
    {
      deviceId: 'DEVICE001',
      voltageRms: 228,
      currentRms: 4,
      activePowerW: 850,
      apparentPowerVa: 912,
      powerFactor: 0.93,
      frequencyHz: 50.0,
      energyKwh: 100.0,
      deviceTimestamp: '2026-11-25T10:00:00Z',
      ingestedAt: '2026-11-25T10:00:01Z',
      isValid: true,
    },
    {
      deviceId: 'DEVICE001',
      voltageRms: 234,
      currentRms: 6,
      activePowerW: 1300,
      apparentPowerVa: 1404,
      powerFactor: 0.92,
      frequencyHz: 50.1,
      energyKwh: 101.2,
      deviceTimestamp: '2026-11-25T11:00:00Z',
      ingestedAt: '2026-11-25T11:00:01Z',
      isValid: true,
    },
    {
      deviceId: 'DEVICE001',
      voltageRms: 230,
      currentRms: 5,
      activePowerW: 1050,
      apparentPowerVa: 1150,
      powerFactor: 0.91,
      frequencyHz: 49.9,
      energyKwh: 0.8, // simulated reset
      deviceTimestamp: '2026-11-25T12:00:00Z',
      ingestedAt: '2026-11-25T12:00:01Z',
      isValid: true,
    },
  ];

  const stats = summarizeTelemetry(points);
  assert.equal(stats.count, 3);
  assert.equal(stats.minVoltage, 228);
  assert.equal(stats.maxVoltage, 234);
  assert.equal(stats.peakPowerW, 1300);
  assert.equal(stats.totalEnergyKwh, 2.0); // 1.2 + 0.8
});

test('Demo generator tags all items with isDemo=true', () => {
  const series = generateDemoTelemetrySeries('DEMO-SEM-001', 1);
  assert.ok(series.length > 20);
  assert.ok(series.every((p) => p.isDemo === true));

  const alerts = generateDemoAlerts();
  assert.ok(alerts.every((a) => a.isDemo === true));

  const billing = generateDemoBillingEstimate('DEMO-SEM-001');
  assert.ok(billing.calculation.totalEstimatedAmountInr > 0);
  assert.equal(billing.history.length, 2);
});
