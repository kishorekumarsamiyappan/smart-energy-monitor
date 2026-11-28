export type UserRole = 'admin' | 'user';
export type ReadingSource = 'automatic_esp32' | 'manual_eb_meter';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'high_current'
  | 'overcurrent_warning'
  | 'high_power'
  | 'abnormal_voltage'
  | 'low_power_factor'
  | 'device_offline'
  | 'sensor_failure'
  | 'unusual_consumption';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  role: UserRole;
  organization?: string | null;
  avatarUrl?: string | null;
  themePreference: 'light' | 'dark' | 'system';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  deviceId: string; // e.g., DEVICE001
  ownerUserId: string;
  name: string;
  locationLabel?: string | null;
  serviceCategory: string; // LT-IA
  consumerEligibleForSubsidy: boolean;
  meterSerialNumber?: string | null;
  firmwareVersion: string;
  hardwareVersion: string;
  telemetryIntervalSec: number;
  monitoringMode: 'automatic' | 'manual_preferred';
  isOnline: boolean;
  wifiRssiDbm?: number | null;
  lastSeenAt?: string | null;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSensorConfig {
  deviceId: string;
  voltageSensorModel: string; // ZMPT101B
  currentSensorModel: string; // SCT-013-000 (100A / 50mA + 22Ω Burden)
  adcModel: string; // ADS131M02
  voltageCalibrationFactor: number;
  currentCalibrationFactor: number;
  phaseCorrectionDeg: number;
  nominalFrequencyHz: number;
  calibrationDate?: string | null;
  calibrationStatus: 'verified' | 'pending' | 'factory_default' | 'recalibration_due';
  adcSpiOk: boolean;
  drdyStatusOk: boolean;
  sensorHealthStatus: 'good' | 'degraded' | 'fault';
}

export interface TelemetryPoint {
  id?: string;
  deviceId: string;
  voltageRms: number;
  currentRms: number;
  activePowerW: number;
  apparentPowerVa: number;
  powerFactor: number;
  frequencyHz: number;
  energyKwh: number;
  deviceTimestamp: string;
  ingestedAt: string;
  wifiRssiDbm?: number | null;
  isValid: boolean;
  isDemo?: boolean;
}

export interface TelemetrySummaryStats {
  count: number;
  minVoltage: number;
  maxVoltage: number;
  avgVoltage: number;
  minCurrent: number;
  maxCurrent: number;
  avgCurrent: number;
  minPowerW: number;
  maxPowerW: number;
  avgPowerW: number;
  peakPowerW: number;
  minPowerFactor: number;
  maxPowerFactor: number;
  avgPowerFactor: number;
  minFrequencyHz: number;
  maxFrequencyHz: number;
  avgFrequencyHz: number;
  totalEnergyKwh: number;
}

export interface TariffSlab {
  id?: string;
  slabOrder: number;
  branch: 'UPTO_500' | 'ABOVE_500' | 'BASE_NON_SUBSIDY';
  fromUnit: number; // inclusive lower unit bound (0 for first, 100, 200, 400...)
  toUnit: number | null; // inclusive upper unit bound (null = infinity)
  ratePerUnitInr: number;
  fixedChargeInr: number;
  description: string;
}

export interface SubsidyRule {
  id?: string;
  name: string;
  freeUnitsUpto500: number;
  freeUnitsAbove500: number;
  eligibilityRequired: boolean;
  notes: string;
}

export interface TariffVersion {
  id: string;
  versionCode: string; // e.g., TNEB-LT1A-2026-IND
  category: string; // LT-IA
  effectiveFrom: string; // ISO date YYYY-MM-DD
  effectiveTo: string | null;
  status: 'draft' | 'active' | 'archived';
  isIndicative: boolean;
  officialVerified: boolean;
  sourceReference: string;
  slabs: TariffSlab[];
  subsidyRule: SubsidyRule;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
}

export interface SlabCalculationLine {
  slabLabel: string;
  fromUnit: number;
  toUnit: number | null;
  unitsInSlab: number;
  ratePerUnitInr: number;
  amountInr: number;
  isSubsidyFree: boolean;
}

export interface BillCalculationInput {
  deviceId: string;
  serviceCategory: 'LT-IA';
  consumerEligible: boolean;
  previousReading: number;
  currentReading: number;
  previousReadingDate: string;
  currentReadingDate: string;
  readingSource: ReadingSource;
  tariffVersion: TariffVersion;
  counterResetCount?: number;
  additionalChargesInr?: number;
  fixedChargesInr?: number;
  existingTariffCrossingDetected?: boolean;
}

export interface BillCalculationResult {
  deviceId: string;
  serviceCategory: 'LT-IA';
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  tariffBranchApplied: 'UPTO_500' | 'ABOVE_500' | 'BASE_NON_SUBSIDY';
  freeUnitsApplied: number;
  billableUnits: number;
  slabBreakdown: SlabCalculationLine[];
  energyChargesInr: number;
  fixedChargesInr: number;
  additionalChargesInr: number;
  subsidySavingsInr: number;
  totalEstimatedAmountInr: number;
  tariffVersionCode: string;
  readingSource: ReadingSource;
  eligibilityStatus: 'eligible' | 'not_eligible';
  calculationDate: string;
  isOfficialBill: false;
  warnings: string[];
  counterResetDetected: boolean;
  crossesTariffEffectiveDate: boolean;
}

export interface ReadingComparison {
  automaticKwh: number;
  manualKwh: number;
  unitDifference: number;
  percentageDifference: number | null;
  disagrees: boolean;
  recommendedPrompt: string;
}

export interface ManualReadingRecord {
  id: string;
  deviceId: string;
  userId: string;
  previousReading: number;
  previousReadingDate: string;
  currentReading: number;
  currentReadingDate: string;
  unitsConsumed: number;
  meterSerialNumber?: string | null;
  billPhotoUrl?: string | null;
  notes?: string | null;
  automaticComparisonKwh?: number | null;
  discrepancyKwh?: number | null;
  discrepancyPercent?: number | null;
  selectedForEstimate: boolean;
  createdAt: string;
}

export interface BillingCycleRecord {
  id: string;
  deviceId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  previousReading: number;
  currentReading: number;
  unitsConsumed: number;
  readingSource: ReadingSource;
  estimatedAmountInr: number;
  actualBillAmountInr?: number | null;
  varianceAmountInr?: number | null;
  tariffVersionCode: string;
  status: 'open' | 'estimated' | 'billed' | 'discrepancy_review';
  calculationPayload: BillCalculationResult;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  deviceId: string;
  userId: string;
  alertType: AlertType;
  thresholdValue: number;
  comparisonOperator: 'gt' | 'lt' | 'outside_range';
  secondaryThreshold?: number | null;
  severity: AlertSeverity;
  enabled: boolean;
  pushEnabled: boolean;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  deviceId: string;
  userId: string;
  alertType: AlertType;
  thresholdValue: number;
  observedValue: number;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  createdAt: string;
  isDemo?: boolean;
}

export type StatusLedMode = 'inbuilt_rgb' | 'single_gpio' | 'disabled';
export type OtaJobStatus =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'flashing'
  | 'rebooting'
  | 'succeeded'
  | 'failed';

export interface DeviceIoConfig {
  deviceId: string;
  statusLedMode: StatusLedMode;
  statusRgbGpio: number;
  statusSingleLedGpio: number;
  pulseLedEnabled: boolean;
  pulseLedGpio: number;
  pulseImpPerKwh: number;
  offlineBufferEnabled: boolean;
  offlineBufferedCount: number;
}

export interface RelaySchedule {
  id: string;
  relayId: string;
  deviceId: string;
  label: string;
  startTimeIst: string; // HH:MM (24h Asia/Kolkata)
  stopTimeIst: string;  // HH:MM (24h Asia/Kolkata)
  daysOfWeek: number[]; // 0 = Sun .. 6 = Sat
  enabled: boolean;
  timezone: 'Asia/Kolkata';
  createdAt: string;
}

export interface DeviceRelay {
  id: string;
  deviceId: string;
  channelIndex: number;
  name: string;
  gpioPin: number;
  activeHigh: boolean;
  currentState: boolean;
  failSafeState: boolean;
  isConfirmedDefault: boolean;
  schedules: RelaySchedule[];
  updatedAt: string;
}

export interface FirmwareReleaseInfo {
  id: string;
  version: string;
  tagName: string;
  githubRepo: string | null;
  binaryUrl: string | null;
  checksumSha256: string | null;
  releaseNotes: string;
  fileSizeBytes?: number | null;
  releasedAt: string;
  isUpdateAvailable?: boolean;
}

export interface FirmwareOtaJob {
  id: string;
  deviceId: string;
  targetVersion: string;
  binaryUrl: string;
  status: OtaJobStatus;
  progressPct: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}
