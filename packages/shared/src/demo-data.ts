import { calculateTnebBill, INDICATIVE_2026_TNEB_LT1A_TARIFF } from './billing-engine.js';
import {
  AlertEvent,
  BillCalculationResult,
  BillingCycleRecord,
  Device,
  DeviceIoConfig,
  DeviceRelay,
  DeviceSensorConfig,
  FirmwareReleaseInfo,
  TelemetryPoint,
  UserProfile,
} from './types.js';

export const DEMO_USER: UserProfile = {
  id: 'demo-user-001',
  fullName: 'Arjun Krishnan (Demo)',
  email: 'demo@smartenergymonitor.local',
  mobileNumber: '9876543210',
  role: 'user',
  organization: 'Demo Residence - Chennai',
  themePreference: 'light',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-11-25T00:00:00.000Z',
};

export function createDemoDevices(now: Date = new Date()): Device[] {
  const isoNow = now.toISOString();
  const staleIso = new Date(now.getTime() - 18 * 60 * 1000).toISOString();
  return [
    {
      id: 'demo-dev-uuid-1',
      deviceId: 'DEMO-SEM-001',
      ownerUserId: DEMO_USER.id,
      name: 'Main Home DB (Demo)',
      locationLabel: 'Chennai Home - Ground Floor',
      serviceCategory: 'LT-IA',
      consumerEligibleForSubsidy: true,
      meterSerialNumber: 'TN-EB-884210',
      firmwareVersion: '1.2.0-demo',
      hardwareVersion: 'ESP32-S3-ADS131M02-REV2',
      telemetryIntervalSec: 5,
      monitoringMode: 'automatic',
      isOnline: true,
      wifiRssiDbm: -54,
      lastSeenAt: isoNow,
      isDemo: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: isoNow,
    },
    {
      id: 'demo-dev-uuid-2',
      deviceId: 'DEMO-SEM-002',
      ownerUserId: DEMO_USER.id,
      name: 'First Floor AC Sub-Meter (Demo)',
      locationLabel: 'First Floor Panel',
      serviceCategory: 'LT-IA',
      consumerEligibleForSubsidy: true,
      meterSerialNumber: 'TN-EB-884211',
      firmwareVersion: '1.2.0-demo',
      hardwareVersion: 'ESP32-S3-ADS131M02-REV2',
      telemetryIntervalSec: 5,
      monitoringMode: 'automatic',
      isOnline: false,
      wifiRssiDbm: -78,
      lastSeenAt: staleIso,
      isDemo: true,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: staleIso,
    },
  ];
}

export const DEMO_SENSOR_CONFIG: Record<string, DeviceSensorConfig> = {
  'DEMO-SEM-001': {
    deviceId: 'DEMO-SEM-001',
    voltageSensorModel: 'ZMPT101B',
    currentSensorModel: 'SCT-013 (30A / 1V built-in burden)',
    adcModel: 'ADS131M02',
    voltageCalibrationFactor: 1.0042,
    currentCalibrationFactor: 0.9965,
    phaseCorrectionDeg: 1.15,
    nominalFrequencyHz: 50.0,
    calibrationDate: '2026-10-10',
    calibrationStatus: 'verified',
    adcSpiOk: true,
    drdyStatusOk: true,
    sensorHealthStatus: 'good',
  },
  'DEMO-SEM-002': {
    deviceId: 'DEMO-SEM-002',
    voltageSensorModel: 'ZMPT101B',
    currentSensorModel: 'SCT-013 (30A / 1V built-in burden)',
    adcModel: 'ADS131M02',
    voltageCalibrationFactor: 1.0,
    currentCalibrationFactor: 1.0,
    phaseCorrectionDeg: 0.9,
    nominalFrequencyHz: 50.0,
    calibrationDate: '2026-10-12',
    calibrationStatus: 'factory_default',
    adcSpiOk: true,
    drdyStatusOk: true,
    sensorHealthStatus: 'good',
  },
};

/**
 * Generates deterministic, non-production Demo Mode telemetry series.
 * Every point is tagged `isDemo: true`.
 */
export function generateDemoTelemetrySeries(
  deviceId: string,
  days: number = 1,
  endTime: Date = new Date(),
): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const stepMinutes = days <= 1 ? 15 : days <= 7 ? 60 : 240;
  const totalPoints = Math.max(12, Math.floor((days * 24 * 60) / stepMinutes));
  const seedOffset = deviceId.endsWith('2') ? 1.4 : 0;

  let cumulativeKwh = deviceId.endsWith('2') ? 610.2 : 1420.5;
  const startMs = endTime.getTime() - totalPoints * stepMinutes * 60_000;

  for (let i = 0; i <= totalPoints; i++) {
    const t = new Date(startMs + i * stepMinutes * 60_000);
    // Compute IST hour-of-day (UTC+5:30)
    const istMinutes = (t.getUTCHours() * 60 + t.getUTCMinutes() + 330) % 1440;
    const hour = istMinutes / 60;

    // Realistic domestic load curve: low overnight, morning spike (7-9h), afternoon AC (13-16h), evening peak (19-22h)
    let basePowerW = 220;
    if (hour >= 6.5 && hour <= 9) basePowerW = 1850;
    else if (hour >= 12.5 && hour <= 16.5) basePowerW = 1450;
    else if (hour >= 18.5 && hour <= 22.5) basePowerW = 2150;
    else if (hour > 9 && hour < 12.5) basePowerW = 680;

    const ripple = Math.sin(i * 0.7 + seedOffset) * 140 + Math.cos(i * 0.35) * 60;
    const activePowerW = Math.max(90, Math.round(basePowerW + ripple));
    const voltageRms = Math.round((230.2 + Math.sin(i * 0.45) * 4.6) * 10) / 10;
    const powerFactor = Math.round((0.88 + Math.sin(i * 0.3) * 0.08) * 100) / 100;
    const apparentPowerVa = Math.round(activePowerW / Math.max(0.65, powerFactor));
    const currentRms = Math.round((apparentPowerVa / voltageRms) * 100) / 100;
    const frequencyHz = Math.round((50.0 + Math.sin(i * 0.25) * 0.08) * 100) / 100;

    if (i > 0) {
      cumulativeKwh += (activePowerW * (stepMinutes / 60)) / 1000;
    }

    const iso = t.toISOString();
    points.push({
      id: `demo-tel-${deviceId}-${i}`,
      deviceId,
      voltageRms,
      currentRms,
      activePowerW,
      apparentPowerVa,
      powerFactor,
      frequencyHz,
      energyKwh: Math.round(cumulativeKwh * 1000) / 1000,
      deviceTimestamp: iso,
      ingestedAt: iso,
      wifiRssiDbm: deviceId.endsWith('2') ? -76 : -53,
      isValid: true,
      isDemo: true,
    });
  }

  return points;
}

export function generateDemoBillingEstimate(deviceId: string): {
  calculation: BillCalculationResult;
  history: BillingCycleRecord[];
} {
  const prevReading = 1320.0;
  const currReading = deviceId.endsWith('2') ? 698.4 : 1685.4;
  const startBase = deviceId.endsWith('2') ? 450.0 : prevReading;
  const calculation = calculateTnebBill({
    deviceId,
    serviceCategory: 'LT-IA',
    consumerEligible: true,
    previousReading: startBase,
    currentReading: currReading,
    previousReadingDate: '2026-10-01',
    currentReadingDate: '2026-11-25',
    readingSource: 'automatic_esp32',
    tariffVersion: INDICATIVE_2026_TNEB_LT1A_TARIFF,
  });

  const prevCycleCalc = calculateTnebBill({
    deviceId,
    serviceCategory: 'LT-IA',
    consumerEligible: true,
    previousReading: 890,
    currentReading: 1320,
    previousReadingDate: '2026-08-01',
    currentReadingDate: '2026-09-30',
    readingSource: 'manual_eb_meter',
    tariffVersion: INDICATIVE_2026_TNEB_LT1A_TARIFF,
  });

  const history: BillingCycleRecord[] = [
    {
      id: `demo-bill-curr-${deviceId}`,
      deviceId,
      userId: DEMO_USER.id,
      periodStart: '2026-10-01',
      periodEnd: '2026-11-25',
      previousReading: startBase,
      currentReading: currReading,
      unitsConsumed: calculation.unitsConsumed,
      readingSource: 'automatic_esp32',
      estimatedAmountInr: calculation.totalEstimatedAmountInr,
      actualBillAmountInr: null,
      varianceAmountInr: null,
      tariffVersionCode: INDICATIVE_2026_TNEB_LT1A_TARIFF.versionCode,
      status: 'open',
      calculationPayload: calculation,
      createdAt: '2026-11-25T10:00:00.000Z',
    },
    {
      id: `demo-bill-prev-${deviceId}`,
      deviceId,
      userId: DEMO_USER.id,
      periodStart: '2026-08-01',
      periodEnd: '2026-09-30',
      previousReading: 890,
      currentReading: 1320,
      unitsConsumed: prevCycleCalc.unitsConsumed,
      readingSource: 'manual_eb_meter',
      estimatedAmountInr: prevCycleCalc.totalEstimatedAmountInr,
      actualBillAmountInr: 1135.0,
      varianceAmountInr: Math.round((1135 - prevCycleCalc.totalEstimatedAmountInr) * 100) / 100,
      tariffVersionCode: INDICATIVE_2026_TNEB_LT1A_TARIFF.versionCode,
      status: 'billed',
      calculationPayload: prevCycleCalc,
      createdAt: '2026-10-02T09:00:00.000Z',
    },
  ];

  return { calculation, history };
}

export function generateDemoAlerts(now: Date = new Date()): AlertEvent[] {
  return [
    {
      id: 'demo-alert-1',
      deviceId: 'DEMO-SEM-001',
      userId: DEMO_USER.id,
      alertType: 'high_power',
      thresholdValue: 2500,
      observedValue: 2680,
      severity: 'warning',
      status: 'active',
      message: '[DEMO] Peak domestic load exceeded 2500 W threshold (observed 2680 W). Advisory alert only.',
      createdAt: new Date(now.getTime() - 25 * 60_000).toISOString(),
      isDemo: true,
    },
    {
      id: 'demo-alert-2',
      deviceId: 'DEMO-SEM-002',
      userId: DEMO_USER.id,
      alertType: 'device_offline',
      thresholdValue: 120,
      observedValue: 1080,
      severity: 'critical',
      status: 'active',
      message: '[DEMO] Sub-meter DEMO-SEM-002 has not reported telemetry for 18 minutes.',
      createdAt: new Date(now.getTime() - 18 * 60_000).toISOString(),
      isDemo: true,
    },
  ];
}

export const DEMO_IO_CONFIG: Record<string, DeviceIoConfig> = {
  'DEMO-SEM-001': {
    deviceId: 'DEMO-SEM-001',
    statusLedMode: 'inbuilt_rgb',
    statusRgbGpio: 48,
    statusSingleLedGpio: 2,
    pulseLedEnabled: true,
    pulseLedGpio: 21,
    pulseImpPerKwh: 1600,
    offlineBufferEnabled: true,
    offlineBufferedCount: 0,
  },
  'DEMO-SEM-002': {
    deviceId: 'DEMO-SEM-002',
    statusLedMode: 'single_gpio',
    statusRgbGpio: 48,
    statusSingleLedGpio: 2,
    pulseLedEnabled: true,
    pulseLedGpio: 21,
    pulseImpPerKwh: 1600,
    offlineBufferEnabled: true,
    offlineBufferedCount: 42,
  },
};

export function createDemoRelays(): Record<string, DeviceRelay[]> {
  const now = '2026-11-26T06:00:00.000Z';
  return {
    'DEMO-SEM-001': [
      {
        id: 'demo-relay-1',
        deviceId: 'DEMO-SEM-001',
        channelIndex: 1,
        name: 'Confirmed Relay 1 (Water Heater)',
        gpioPin: 4,
        activeHigh: true,
        currentState: false,
        failSafeState: false,
        isConfirmedDefault: true,
        updatedAt: now,
        schedules: [
          {
            id: 'demo-sched-1',
            relayId: 'demo-relay-1',
            deviceId: 'DEMO-SEM-001',
            label: 'Morning Geyser Window',
            startTimeIst: '06:00',
            stopTimeIst: '07:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            enabled: true,
            timezone: 'Asia/Kolkata',
            createdAt: now,
          },
        ],
      },
    ],
    'DEMO-SEM-002': [
      {
        id: 'demo-relay-2',
        deviceId: 'DEMO-SEM-002',
        channelIndex: 1,
        name: 'Confirmed Relay 1 (AC Contactor)',
        gpioPin: 4,
        activeHigh: true,
        currentState: true,
        failSafeState: false,
        isConfirmedDefault: true,
        updatedAt: now,
        schedules: [],
      },
    ],
  };
}

export const DEMO_LATEST_FIRMWARE: FirmwareReleaseInfo = {
  id: 'demo-fw-1.3.0',
  version: '1.3.0',
  tagName: 'v1.3.0',
  githubRepo: 'smart-energy-monitor/esp32s3-firmware',
  binaryUrl: 'https://github.com/smart-energy-monitor/esp32s3-firmware/releases/download/v1.3.0/sem-esp32s3-v1.3.0.bin',
  checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  releaseNotes:
    'Adds GitHub FOTA rollback safety, offline LittleFS/SPIFFS ring-buffer sync, offline RTC relay schedules, pulse LED, and RGB/Single status LED modes.',
  fileSizeBytes: 1048576,
  releasedAt: '2026-11-25T12:00:00.000Z',
  isUpdateAvailable: true,
};
