import { STALE_TELEMETRY_SECONDS } from './constants.js';
import { TelemetryPoint, TelemetrySummaryStats } from './types.js';

export interface TelemetryValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validateTelemetryValues(input: {
  voltageRms: number;
  currentRms: number;
  activePowerW: number;
  apparentPowerVa: number;
  powerFactor: number;
  frequencyHz: number;
  energyKwh: number;
}): TelemetryValidationResult {
  const reasons: string[] = [];

  if (!Number.isFinite(input.voltageRms) || input.voltageRms < 0 || input.voltageRms > 450) {
    reasons.push('voltage_rms out of safe range (0..450V)');
  }
  if (!Number.isFinite(input.currentRms) || input.currentRms < 0 || input.currentRms > 100) {
    reasons.push('current_rms out of range (0..100A)');
  }
  if (!Number.isFinite(input.activePowerW) || input.activePowerW < -35000 || input.activePowerW > 35000) {
    reasons.push('active_power out of range (-35000..35000W)');
  }
  if (!Number.isFinite(input.apparentPowerVa) || input.apparentPowerVa < 0 || input.apparentPowerVa > 40000) {
    reasons.push('apparent_power out of range (0..40000VA)');
  }
  if (!Number.isFinite(input.powerFactor) || input.powerFactor < -1.0 || input.powerFactor > 1.0) {
    reasons.push('power_factor out of range (-1..1)');
  }
  if (
    !Number.isFinite(input.frequencyHz) ||
    (input.frequencyHz !== 0 && (input.frequencyHz < 40 || input.frequencyHz > 70))
  ) {
    reasons.push('frequency out of range (0 or 40..70Hz)');
  }
  if (!Number.isFinite(input.energyKwh) || input.energyKwh < 0) {
    reasons.push('energy_kwh must be non-negative');
  }

  // Physical consistency check: |active_power| cannot greatly exceed apparent_power (+measurement noise margin)
  if (
    Number.isFinite(input.activePowerW) &&
    Number.isFinite(input.apparentPowerVa) &&
    input.apparentPowerVa > 10 &&
    Math.abs(input.activePowerW) > input.apparentPowerVa * 1.15
  ) {
    reasons.push('active_power exceeds apparent_power beyond physical tolerance');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function isTelemetryStale(
  lastUpdateIso: string | null | undefined,
  now: Date = new Date(),
  maxAgeSeconds: number = STALE_TELEMETRY_SECONDS,
): boolean {
  if (!lastUpdateIso) return true;
  const ts = new Date(lastUpdateIso).getTime();
  if (Number.isNaN(ts)) return true;
  return now.getTime() - ts > maxAgeSeconds * 1000;
}

export function summarizeTelemetry(points: TelemetryPoint[]): TelemetrySummaryStats {
  if (points.length === 0) {
    return {
      count: 0,
      minVoltage: 0,
      maxVoltage: 0,
      avgVoltage: 0,
      minCurrent: 0,
      maxCurrent: 0,
      avgCurrent: 0,
      minPowerW: 0,
      maxPowerW: 0,
      avgPowerW: 0,
      peakPowerW: 0,
      minPowerFactor: 0,
      maxPowerFactor: 0,
      avgPowerFactor: 0,
      minFrequencyHz: 0,
      maxFrequencyHz: 0,
      avgFrequencyHz: 0,
      totalEnergyKwh: 0,
    };
  }

  let minV = Infinity, maxV = -Infinity, sumV = 0;
  let minI = Infinity, maxI = -Infinity, sumI = 0;
  let minP = Infinity, maxP = -Infinity, sumP = 0;
  let minPf = Infinity, maxPf = -Infinity, sumPf = 0;
  let minF = Infinity, maxF = -Infinity, sumF = 0;

  const sorted = [...points].sort(
    (a, b) => new Date(a.deviceTimestamp).getTime() - new Date(b.deviceTimestamp).getTime(),
  );

  for (const pt of sorted) {
    minV = Math.min(minV, pt.voltageRms);
    maxV = Math.max(maxV, pt.voltageRms);
    sumV += pt.voltageRms;

    minI = Math.min(minI, pt.currentRms);
    maxI = Math.max(maxI, pt.currentRms);
    sumI += pt.currentRms;

    minP = Math.min(minP, pt.activePowerW);
    maxP = Math.max(maxP, pt.activePowerW);
    sumP += pt.activePowerW;

    minPf = Math.min(minPf, pt.powerFactor);
    maxPf = Math.max(maxPf, pt.powerFactor);
    sumPf += pt.powerFactor;

    minF = Math.min(minF, pt.frequencyHz);
    maxF = Math.max(maxF, pt.frequencyHz);
    sumF += pt.frequencyHz;
  }

  // Energy span across monotonic counter (guarding counter resets)
  let totalEnergyKwh = 0;
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i].energyKwh - sorted[i - 1].energyKwh;
    if (delta >= 0) {
      totalEnergyKwh += delta;
    } else {
      // Counter reset fallback: treat new value as post-reset accrual
      totalEnergyKwh += sorted[i].energyKwh;
    }
  }

  const n = sorted.length;
  const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const r3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;

  return {
    count: n,
    minVoltage: r2(minV),
    maxVoltage: r2(maxV),
    avgVoltage: r2(sumV / n),
    minCurrent: r2(minI),
    maxCurrent: r2(maxI),
    avgCurrent: r2(sumI / n),
    minPowerW: r2(minP),
    maxPowerW: r2(maxP),
    avgPowerW: r2(sumP / n),
    peakPowerW: r2(maxP),
    minPowerFactor: r3(minPf),
    maxPowerFactor: r3(maxPf),
    avgPowerFactor: r3(sumPf / n),
    minFrequencyHz: r2(minF),
    maxFrequencyHz: r2(maxF),
    avgFrequencyHz: r2(sumF / n),
    totalEnergyKwh: r3(totalEnergyKwh),
  };
}
