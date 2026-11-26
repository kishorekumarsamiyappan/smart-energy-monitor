import {
  AlertEvent,
  AlertRule,
  BillingCycleRecord,
  calculateTnebBill,
  compareSemver,
  Device,
  DeviceIoConfig,
  DeviceRelay,
  DeviceSensorConfig,
  FirmwareOtaJob,
  FirmwareReleaseInfo,
  formatKolkataDate,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
  ManualReadingRecord,
  OtaJobStatus,
  RelaySchedule,
  RESERVED_ESP32_GPIOS,
  StatusLedMode,
  summarizeTelemetry,
  TariffVersion,
  TelemetryPoint,
  UserProfile,
  UserRole,
} from '@sem/shared';
import { hashPassword, sha256Hex, verifyPassword } from './crypto';
import { WorkerEnv } from './types';

export class WorkerHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_ERROR',
  ) {
    super(message);
  }
}

export interface InternalDevice {
  uuid: string;
  deviceId: string;
  ownerUserId: string;
  sharedUserIds: string[];
  name: string;
  locationLabel: string | null;
  serviceCategory: string;
  consumerEligibleForSubsidy: boolean;
  meterSerialNumber: string | null;
  firmwareVersion: string;
  hardwareVersion: string;
  telemetryIntervalSec: number;
  monitoringMode: 'automatic' | 'manual_preferred';
  isOnline: boolean;
  wifiRssiDbm: number | null;
  lastSeenAt: string | null;
  offlineBufferedCount: number;
  otaStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryIngestResult {
  inserted: boolean;
  isHistoricalBackfill: boolean;
  deviceUuid: string;
  ownerUserId: string;
  lifetimeKwh: number;
  counterResetDetected: boolean;
  point: TelemetryPoint;
}

export interface WorkerStore {
  readonly engine: string;
  // Auth
  isTokenRevoked(jti: string): Promise<boolean>;
  revokeToken(jti: string): Promise<void>;
  registerUser(input: {
    fullName: string;
    email: string;
    mobileNumber: string;
    password: string;
    organization?: string;
  }): Promise<UserProfile>;
  verifyUserLogin(identifier: string, password: string): Promise<UserProfile>;
  getUserById(userId: string): Promise<UserProfile | null>;
  updateUserProfile(
    userId: string,
    patch: { fullName?: string; mobileNumber?: string; organization?: string | null; themePreference?: 'light' | 'dark' | 'system' },
  ): Promise<UserProfile>;
  changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  createResetToken(email: string): Promise<string | null>;
  consumeResetToken(token: string, newPassword: string): Promise<void>;

  // Devices & Config
  listDevices(userId: string, role: UserRole): Promise<Device[]>;
  resolveAuthorizedDevice(deviceCodeOrUuid: string, userId: string, role: UserRole): Promise<InternalDevice>;
  createDevice(
    ownerUserId: string,
    input: {
      deviceId: string;
      name: string;
      locationLabel?: string;
      serviceCategory: string;
      consumerEligibleForSubsidy: boolean;
      meterSerialNumber?: string;
    },
  ): Promise<{ device: Device; mqttUsername: string; mqttPassword: string }>;
  updateDevice(
    deviceUuid: string,
    actorUserId: string,
    role: UserRole,
    patch: {
      name?: string;
      locationLabel?: string | null;
      telemetryIntervalSec?: number;
      monitoringMode?: 'automatic' | 'manual_preferred';
      consumerEligibleForSubsidy?: boolean;
      sensorConfig?: {
        voltageCalibrationFactor?: number;
        currentCalibrationFactor?: number;
        phaseCorrectionDeg?: number;
        calibrationStatus?: 'verified' | 'pending' | 'factory_default' | 'recalibration_due';
      };
    },
  ): Promise<Device>;
  deleteDevice(deviceUuid: string): Promise<void>;
  getSensorConfig(deviceUuid: string, deviceCode: string): Promise<DeviceSensorConfig>;
  getIoConfig(deviceUuid: string, deviceCode: string): Promise<DeviceIoConfig>;
  updateIoConfig(
    deviceUuid: string,
    deviceCode: string,
    patch: Partial<{
      statusLedMode: StatusLedMode;
      statusRgbGpio: number;
      statusSingleLedGpio: number;
      pulseLedEnabled: boolean;
      pulseLedGpio: number;
      pulseImpPerKwh: number;
      offlineBufferEnabled: boolean;
    }>,
  ): Promise<DeviceIoConfig>;

  // Telemetry & Energy
  ingestTelemetry(input: {
    deviceId: string;
    voltageRms: number;
    currentRms: number;
    activePowerW: number;
    apparentPowerVa: number;
    powerFactor: number;
    frequencyHz: number;
    energyKwh: number;
    deviceTimestamp: string;
    wifiRssiDbm?: number | null;
    seq?: number;
    buffered?: boolean;
  }): Promise<TelemetryIngestResult>;
  getLatestTelemetry(deviceUuid: string): Promise<TelemetryPoint | null>;
  getTelemetryHistory(
    deviceUuid: string,
    deviceCode: string,
    opts: { days?: number; startDate?: string; endDate?: string },
  ): Promise<{ deviceId: string; points: TelemetryPoint[]; summary: ReturnType<typeof summarizeTelemetry>; daily: Array<Record<string, unknown>> }>;
  getEnergyCounter(deviceUuid: string): Promise<{ lifetimeKwh: number; counterResetCount: number; resetOffsetKwh: number }>;
  getDailyRollups(deviceUuid: string, days: number): Promise<Array<Record<string, unknown>>>;
  getMonthlyRollups(deviceUuid: string): Promise<Array<Record<string, unknown>>>;
  markDeviceOffline(deviceCode: string, reason: string): Promise<void>;
  updateDeviceStatusFromMqtt(
    deviceCode: string,
    opts: { offlineBufferedCount?: number; version?: string; otaStatus?: OtaJobStatus; otaProgress?: number; otaJobId?: string; otaError?: string; relays?: Array<{ ch: number; state: boolean }> },
  ): Promise<void>;
  pruneOldTelemetry(retentionDays: number): Promise<{ deletedRows: number; retentionDays: number; prunedBeforeUtc: string }>;

  // Relays & Schedules
  listRelays(deviceUuid: string, deviceCode: string): Promise<DeviceRelay[]>;
  addRelay(deviceUuid: string, deviceCode: string, input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean }): Promise<DeviceRelay>;
  updateRelay(deviceUuid: string, deviceCode: string, relayId: string, patch: { name?: string; currentState?: boolean; failSafeState?: boolean; activeHigh?: boolean }): Promise<DeviceRelay>;
  deleteRelay(deviceUuid: string, relayId: string): Promise<void>;
  addSchedule(deviceUuid: string, deviceCode: string, relayId: string, input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean }): Promise<RelaySchedule>;
  updateSchedule(deviceUuid: string, relayId: string, scheduleId: string, patch: { label?: string; startTimeIst?: string; stopTimeIst?: string; daysOfWeek?: number[]; enabled?: boolean }): Promise<void>;
  deleteSchedule(deviceUuid: string, relayId: string, scheduleId: string): Promise<void>;

  // Firmware FOTA
  listFirmwareReleases(): Promise<FirmwareReleaseInfo[]>;
  registerFirmwareRelease(input: {
    version: string;
    tagName?: string;
    githubRepo?: string | null;
    binaryUrl: string;
    checksumSha256?: string | null;
    releaseNotes?: string;
    fileSizeBytes?: number | null;
  }): Promise<FirmwareReleaseInfo>;
  getDeviceFirmwareStatus(deviceUuid: string, currentVersion: string): Promise<{
    currentVersion: string;
    githubRepo: string | null;
    latestRelease: FirmwareReleaseInfo | null;
    updateAvailable: boolean;
    jobs: FirmwareOtaJob[];
  }>;
  createOtaJob(input: {
    deviceUuid: string;
    deviceCode: string;
    userId: string;
    targetVersion?: string;
    binaryUrl?: string;
    checksumSha256?: string;
  }): Promise<FirmwareOtaJob>;

  // Billing & Tariffs
  getActiveTariff(): Promise<TariffVersion>;
  getAllTariffs(): Promise<TariffVersion[]>;
  createTariff(adminUserId: string, input: Omit<TariffVersion, 'id' | 'status'>): Promise<TariffVersion>;
  updateTariffStatus(tariffId: string, patch: { status?: 'draft' | 'active' | 'archived'; officialVerified?: boolean; isIndicative?: boolean }): Promise<TariffVersion>;
  getBillingHistory(userId: string): Promise<{ cycles: BillingCycleRecord[]; manualReadings: ManualReadingRecord[] }>;
  getBillingById(userId: string, cycleId: string): Promise<BillingCycleRecord>;
  persistBillCalculation(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: 'automatic_esp32' | 'manual_eb_meter';
    consumerEligible: boolean;
    fixedChargesInr?: number;
    additionalChargesInr?: number;
  }): Promise<{ cycle: BillingCycleRecord; calculation: ReturnType<typeof calculateTnebBill> }>;
  submitManualReading(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    consumerEligible: boolean;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    notes?: string;
    preferredSource?: 'automatic_esp32' | 'manual_eb_meter';
  }): Promise<{ manualReading: ManualReadingRecord; cycle: BillingCycleRecord; calculation: ReturnType<typeof calculateTnebBill> }>;
  recordActualBill(userId: string, cycleId: string, actualAmountInr: number, officialBillNumber?: string): Promise<BillingCycleRecord>;

  // Alerts & Admin
  evaluateAlerts(point: TelemetryPoint, deviceUuid: string, ownerUserId: string): Promise<AlertEvent[]>;
  createDeviceAlert(deviceCode: string, alertType: AlertEvent['alertType'], observed: number, message: string, severity?: AlertEvent['severity']): Promise<void>;
  listAlerts(userId: string, role: UserRole): Promise<{ alerts: AlertEvent[]; rules: AlertRule[] }>;
  acknowledgeAlert(alertId: string, userId: string, role: UserRole): Promise<void>;
  createAlertRule(userId: string, deviceUuid: string, deviceCode: string, rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>): Promise<AlertRule>;
  updateAlertRule(ruleId: string, userId: string, role: UserRole, patch: Partial<Pick<AlertRule, 'thresholdValue' | 'enabled' | 'pushEnabled' | 'severity'>>): Promise<AlertRule>;
  listAllUsers(): Promise<Array<Record<string, unknown>>>;
  assignDeviceOwnership(deviceCodeOrUuid: string, newOwnerId: string): Promise<Device>;
  getPlatformStats(): Promise<{ users: number; devices: number; telemetryRows: number; activeAlerts: number }>;
}

function toPublicDevice(d: InternalDevice): Device {
  return {
    id: d.uuid,
    deviceId: d.deviceId,
    ownerUserId: d.ownerUserId,
    name: d.name,
    locationLabel: d.locationLabel,
    serviceCategory: d.serviceCategory,
    consumerEligibleForSubsidy: d.consumerEligibleForSubsidy,
    meterSerialNumber: d.meterSerialNumber,
    firmwareVersion: d.firmwareVersion,
    hardwareVersion: d.hardwareVersion,
    telemetryIntervalSec: d.telemetryIntervalSec,
    monitoringMode: d.monitoringMode,
    isOnline: d.isOnline,
    wifiRssiDbm: d.wifiRssiDbm,
    lastSeenAt: d.lastSeenAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/**
 * Production Cloudflare Worker Data Adapter over HTTPS Supabase PostgREST + RPC.
 * Uses pure Web Standard `fetch()` (0 TCP sockets, <2ms CPU inside Cloudflare Free Tier).
 */
export class SupabaseStore implements WorkerStore {
  readonly engine = 'supabase-postgrest';
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly defaultGithubRepo: string;

  constructor(env: WorkerEnv) {
    this.baseUrl = (env.SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
    this.serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    this.defaultGithubRepo = env.GITHUB_FIRMWARE_REPO || 'owner/smart-energy-monitor-firmware';
  }

  private assertConfigured(): void {
    if (!this.baseUrl || !this.serviceKey) {
      throw new WorkerHttpError(
        503,
        'Cloudflare Worker secrets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured yet.',
        'CONFIG_MISSING',
      );
    }
  }

  private buildAuthHeaders(): Record<string, string> {
    const isModernSecret = this.serviceKey.startsWith('sb_secret_') || !this.serviceKey.includes('.');
    return {
      apikey: this.serviceKey,
      ...(isModernSecret ? {} : { Authorization: `Bearer ${this.serviceKey}` }),
      'Content-Type': 'application/json',
      'User-Agent': 'SmartEnergyMonitor-Worker/1.0',
    };
  }

  private async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.assertConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...this.buildAuthHeaders(),
        Prefer: 'return=representation',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new WorkerHttpError(res.status >= 400 && res.status < 500 ? res.status : 502, `Supabase REST error: ${txt}`, 'SUPABASE_ERROR');
    }
    if (res.status === 204) return [] as unknown as T;
    return (await res.json()) as T;
  }

  private async rpc<T>(fnName: string, body: Record<string, unknown>): Promise<T> {
    this.assertConfigured();
    const res = await fetch(`${this.baseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: this.buildAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (txt.includes('DEVICE_NOT_FOUND')) {
        throw new WorkerHttpError(404, 'Unknown device', 'DEVICE_NOT_FOUND');
      }
      throw new WorkerHttpError(502, `Supabase RPC error (${fnName}): ${txt}`, 'SUPABASE_RPC_ERROR');
    }
    return (await res.json()) as T;
  }

  private static revokedJtis = new Set<string>();
  private static resetTokens = new Map<string, { userId: string; expiresAt: number }>();

  async isTokenRevoked(jti: string): Promise<boolean> {
    return SupabaseStore.revokedJtis.has(jti);
  }
  async revokeToken(jti: string): Promise<void> {
    SupabaseStore.revokedJtis.add(jti);
  }

  private mapUser(r: Record<string, unknown>): UserProfile {
    return {
      id: String(r.id),
      fullName: String(r.full_name),
      email: String(r.email),
      mobileNumber: String(r.mobile_number),
      role: r.role as UserRole,
      organization: r.organization ? String(r.organization) : null,
      avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      themePreference: (r.theme_preference as 'light' | 'dark' | 'system') ?? 'light',
      isActive: Boolean(r.is_active),
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  }

  async registerUser(input: {
    fullName: string;
    email: string;
    mobileNumber: string;
    password: string;
    organization?: string;
  }): Promise<UserProfile> {
    const emailNorm = input.email.trim().toLowerCase();
    const mobileNorm = input.mobileNumber.trim();
    const existing = await this.rest<Array<{ id: string }>>(
      `users?or=(email.eq.${encodeURIComponent(emailNorm)},mobile_number.eq.${encodeURIComponent(mobileNorm)})&select=id&limit=1`,
    );
    if (existing.length > 0) {
      throw new WorkerHttpError(409, 'An account with this email or mobile number already exists.', 'DUPLICATE_USER');
    }
    const passwordHash = await hashPassword(input.password);
    const created = await this.rest<Array<Record<string, unknown>>>('users', {
      method: 'POST',
      body: JSON.stringify({
        full_name: input.fullName.trim(),
        email: emailNorm,
        mobile_number: mobileNorm,
        password_hash: passwordHash,
        role: 'user',
        organization: input.organization?.trim() || null,
        email_verified: false,
      }),
    });
    return this.mapUser(created[0]);
  }

  async verifyUserLogin(identifier: string, password: string): Promise<UserProfile> {
    const clean = identifier.trim().toLowerCase();
    const rows = await this.rest<Array<Record<string, unknown>>>(
      `users?or=(email.eq.${encodeURIComponent(clean)},mobile_number.eq.${encodeURIComponent(identifier.trim())})&select=*&limit=1`,
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash ? String(user.password_hash) : null))) {
      throw new WorkerHttpError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }
    if (!user.is_active) {
      throw new WorkerHttpError(403, 'Account is disabled.', 'ACCOUNT_DISABLED');
    }
    return this.mapUser(user);
  }

  async getUserById(userId: string): Promise<UserProfile | null> {
    const rows = await this.rest<Array<Record<string, unknown>>>(`users?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async updateUserProfile(
    userId: string,
    patch: { fullName?: string; mobileNumber?: string; organization?: string | null; themePreference?: 'light' | 'dark' | 'system' },
  ): Promise<UserProfile> {
    const payload: Record<string, unknown> = {};
    if (patch.fullName !== undefined) payload.full_name = patch.fullName.trim();
    if (patch.mobileNumber !== undefined) payload.mobile_number = patch.mobileNumber.trim();
    if (patch.organization !== undefined) payload.organization = patch.organization;
    if (patch.themePreference !== undefined) payload.theme_preference = patch.themePreference;

    const rows = await this.rest<Array<Record<string, unknown>>>(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!rows[0]) throw new WorkerHttpError(404, 'User not found', 'NOT_FOUND');
    return this.mapUser(rows[0]);
  }

  async changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const rows = await this.rest<Array<Record<string, unknown>>>(`users?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
    const u = rows[0];
    if (!u || !(await verifyPassword(currentPassword, u.password_hash ? String(u.password_hash) : null))) {
      throw new WorkerHttpError(401, 'Current password is incorrect.', 'INVALID_PASSWORD');
    }
    await this.rest(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: await hashPassword(newPassword) }),
    });
  }

  async createResetToken(email: string): Promise<string | null> {
    const rows = await this.rest<Array<Record<string, unknown>>>(
      `users?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=id&limit=1`,
    );
    if (!rows[0]) return null;
    const raw = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
    SupabaseStore.resetTokens.set(await sha256Hex(raw), {
      userId: String(rows[0].id),
      expiresAt: Date.now() + 1800_000,
    });
    return raw;
  }

  async consumeResetToken(token: string, newPassword: string): Promise<void> {
    const hashed = await sha256Hex(token);
    const rec = SupabaseStore.resetTokens.get(hashed);
    if (!rec || rec.expiresAt < Date.now()) {
      throw new WorkerHttpError(400, 'Reset token is invalid or expired.', 'INVALID_RESET_TOKEN');
    }
    await this.rest(`users?id=eq.${encodeURIComponent(rec.userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ password_hash: await hashPassword(newPassword) }),
    });
    SupabaseStore.resetTokens.delete(hashed);
  }

  private mapInternalDevice(d: Record<string, unknown>, st?: Record<string, unknown>): InternalDevice {
    return {
      uuid: String(d.id),
      deviceId: String(d.device_id),
      ownerUserId: String(d.owner_user_id),
      sharedUserIds: Array.isArray(d.shared_user_ids) ? d.shared_user_ids.map(String) : [],
      name: String(d.name),
      locationLabel: d.location_label ? String(d.location_label) : null,
      serviceCategory: String(d.service_category ?? 'LT-IA'),
      consumerEligibleForSubsidy: Boolean(d.consumer_eligible_for_subsidy),
      meterSerialNumber: d.meter_serial_number ? String(d.meter_serial_number) : null,
      firmwareVersion: String(d.firmware_version ?? '1.0.0'),
      hardwareVersion: String(d.hardware_version ?? 'ESP32-S3-ADS131M02-REV2'),
      telemetryIntervalSec: Number(d.telemetry_interval_sec ?? 5),
      monitoringMode: (d.monitoring_mode as 'automatic' | 'manual_preferred') ?? 'automatic',
      isOnline: Boolean(st?.is_online ?? false),
      wifiRssiDbm: st?.wifi_rssi_dbm != null ? Number(st.wifi_rssi_dbm) : null,
      lastSeenAt: st?.last_seen_at ? new Date(String(st.last_seen_at)).toISOString() : null,
      offlineBufferedCount: Number(st?.offline_buffered_count ?? 0),
      otaStatus: String(st?.ota_status ?? 'idle'),
      createdAt: new Date(String(d.created_at)).toISOString(),
      updatedAt: new Date(String(d.updated_at)).toISOString(),
    };
  }

  async listDevices(userId: string, role: UserRole): Promise<Device[]> {
    const devFilter =
      role === 'admin'
        ? 'devices?select=*&order=created_at.desc'
        : `devices?or=(owner_user_id.eq.${encodeURIComponent(userId)},shared_user_ids.cs.{${encodeURIComponent(userId)}})&select=*&order=created_at.desc`;
    const [devs, statuses] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(devFilter),
      this.rest<Array<Record<string, unknown>>>('device_status?select=*'),
    ]);
    const stMap = new Map(statuses.map((s) => [String(s.device_uuid), s]));
    return devs.map((d) => toPublicDevice(this.mapInternalDevice(d, stMap.get(String(d.id)))));
  }

  async resolveAuthorizedDevice(deviceCodeOrUuid: string, userId: string, role: UserRole): Promise<InternalDevice> {
    const clean = deviceCodeOrUuid.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    const query = isUuid
      ? `devices?id=eq.${encodeURIComponent(clean)}&select=*&limit=1`
      : `devices?device_id=eq.${encodeURIComponent(clean.toUpperCase())}&select=*&limit=1`;
    const rows = await this.rest<Array<Record<string, unknown>>>(query);
    const d = rows[0];
    if (!d) throw new WorkerHttpError(404, 'Device not found', 'DEVICE_NOT_FOUND');

    const shared = Array.isArray(d.shared_user_ids) ? d.shared_user_ids.map(String) : [];
    if (role !== 'admin' && String(d.owner_user_id) !== userId && !shared.includes(userId)) {
      throw new WorkerHttpError(403, 'You do not have permission to access this device.', 'FORBIDDEN_DEVICE');
    }
    const sts = await this.rest<Array<Record<string, unknown>>>(`device_status?device_uuid=eq.${d.id}&limit=1`);
    return this.mapInternalDevice(d, sts[0]);
  }

  async createDevice(
    ownerUserId: string,
    input: {
      deviceId: string;
      name: string;
      locationLabel?: string;
      serviceCategory: string;
      consumerEligibleForSubsidy: boolean;
      meterSerialNumber?: string;
    },
  ): Promise<{ device: Device; mqttUsername: string; mqttPassword: string }> {
    const code = input.deviceId.trim().toUpperCase();
    const dup = await this.rest<Array<{ id: string }>>(`devices?device_id=eq.${encodeURIComponent(code)}&select=id&limit=1`);
    if (dup.length > 0) {
      throw new WorkerHttpError(409, `Device ${code} is already paired.`, 'DEVICE_EXISTS');
    }

    const inserted = await this.rest<Array<Record<string, unknown>>>('devices', {
      method: 'POST',
      body: JSON.stringify({
        device_id: code,
        owner_user_id: ownerUserId,
        name: input.name.trim(),
        location_label: input.locationLabel?.trim() || null,
        service_category: input.serviceCategory || 'LT-IA',
        consumer_eligible_for_subsidy: input.consumerEligibleForSubsidy,
        meter_serial_number: input.meterSerialNumber?.trim() || null,
      }),
    });
    const devRow = inserted[0];
    const uuid = String(devRow.id);

    const mqttUsername = `sem_${code.toLowerCase()}`;
    const mqttPassword = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().slice(0, 8);
    const mqttHash = await hashPassword(mqttPassword);

    await Promise.all([
      this.rest('device_credentials', {
        method: 'POST',
        body: JSON.stringify({ device_uuid: uuid, mqtt_username: mqttUsername, mqtt_password_hash: mqttHash }),
      }),
      this.rest('device_status', { method: 'POST', body: JSON.stringify({ device_uuid: uuid, is_online: false }) }),
      this.rest('energy_counters', { method: 'POST', body: JSON.stringify({ device_uuid: uuid, lifetime_kwh: 0 }) }),
      this.rest('calibration_records', { method: 'POST', body: JSON.stringify({ device_uuid: uuid }) }),
      this.rest('device_io_configs', { method: 'POST', body: JSON.stringify({ device_uuid: uuid }) }),
      this.rest('device_relays', {
        method: 'POST',
        body: JSON.stringify({
          device_uuid: uuid,
          channel_index: 1,
          name: 'Confirmed Relay 1',
          gpio_pin: 4,
          active_high: true,
          fail_safe_state: false,
          is_confirmed_default: true,
        }),
      }),
    ]);

    return {
      device: toPublicDevice(this.mapInternalDevice(devRow)),
      mqttUsername,
      mqttPassword,
    };
  }

  async updateDevice(
    deviceUuid: string,
    actorUserId: string,
    role: UserRole,
    patch: {
      name?: string;
      locationLabel?: string | null;
      telemetryIntervalSec?: number;
      monitoringMode?: 'automatic' | 'manual_preferred';
      consumerEligibleForSubsidy?: boolean;
      sensorConfig?: {
        voltageCalibrationFactor?: number;
        currentCalibrationFactor?: number;
        phaseCorrectionDeg?: number;
        calibrationStatus?: 'verified' | 'pending' | 'factory_default' | 'recalibration_due';
      };
    },
  ): Promise<Device> {
    if (patch.sensorConfig && role !== 'admin') {
      throw new WorkerHttpError(403, 'Only administrators may modify calibration constants.', 'ADMIN_REQUIRED');
    }
    const upd: Record<string, unknown> = {};
    if (patch.name !== undefined) upd.name = patch.name.trim();
    if (patch.locationLabel !== undefined) upd.location_label = patch.locationLabel;
    if (patch.telemetryIntervalSec !== undefined) upd.telemetry_interval_sec = patch.telemetryIntervalSec;
    if (patch.monitoringMode !== undefined) upd.monitoring_mode = patch.monitoringMode;
    if (patch.consumerEligibleForSubsidy !== undefined) upd.consumer_eligible_for_subsidy = patch.consumerEligibleForSubsidy;

    let devRows: Array<Record<string, unknown>>;
    if (Object.keys(upd).length > 0) {
      devRows = await this.rest<Array<Record<string, unknown>>>(`devices?id=eq.${deviceUuid}`, {
        method: 'PATCH',
        body: JSON.stringify(upd),
      });
    } else {
      devRows = await this.rest<Array<Record<string, unknown>>>(`devices?id=eq.${deviceUuid}&select=*`);
    }

    if (patch.sensorConfig) {
      const existingCal = await this.rest<Array<Record<string, unknown>>>(
        `calibration_records?device_uuid=eq.${deviceUuid}&order=calibrated_at.desc&limit=1`,
      );
      const prev = existingCal[0] ?? {};
      await this.rest('calibration_records', {
        method: 'POST',
        body: JSON.stringify({
          device_uuid: deviceUuid,
          voltage_cal_factor: patch.sensorConfig.voltageCalibrationFactor ?? prev.voltage_cal_factor ?? 1.0,
          current_cal_factor: patch.sensorConfig.currentCalibrationFactor ?? prev.current_cal_factor ?? 1.0,
          phase_correction_deg: patch.sensorConfig.phaseCorrectionDeg ?? prev.phase_correction_deg ?? 0.0,
          calibration_status: patch.sensorConfig.calibrationStatus ?? 'verified',
          calibrated_by_user_id: actorUserId,
        }),
      });
    }

    const sts = await this.rest<Array<Record<string, unknown>>>(`device_status?device_uuid=eq.${deviceUuid}&limit=1`);
    return toPublicDevice(this.mapInternalDevice(devRows[0], sts[0]));
  }

  async deleteDevice(deviceUuid: string): Promise<void> {
    await this.rest(`devices?id=eq.${deviceUuid}`, { method: 'DELETE' });
  }

  async getSensorConfig(deviceUuid: string, deviceCode: string): Promise<DeviceSensorConfig> {
    const [calRows, stRows] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(`calibration_records?device_uuid=eq.${deviceUuid}&order=calibrated_at.desc&limit=1`),
      this.rest<Array<Record<string, unknown>>>(`device_status?device_uuid=eq.${deviceUuid}&limit=1`),
    ]);
    const c = calRows[0] ?? {};
    const st = stRows[0] ?? {};
    return {
      deviceId: deviceCode,
      voltageSensorModel: String(c.voltage_sensor_model ?? 'ZMPT101B'),
      currentSensorModel: String(c.current_sensor_model ?? 'SCT-013 (30A / 1V built-in burden)'),
      adcModel: String(c.adc_model ?? 'ADS131M02'),
      voltageCalibrationFactor: Number(c.voltage_cal_factor ?? 1.0),
      currentCalibrationFactor: Number(c.current_cal_factor ?? 1.0),
      phaseCorrectionDeg: Number(c.phase_correction_deg ?? 0.0),
      nominalFrequencyHz: Number(c.nominal_frequency_hz ?? 50.0),
      calibrationDate: c.calibrated_at ? new Date(String(c.calibrated_at)).toISOString().slice(0, 10) : null,
      calibrationStatus: (c.calibration_status as DeviceSensorConfig['calibrationStatus']) ?? 'factory_default',
      adcSpiOk: st.adc_spi_ok !== false,
      drdyStatusOk: st.drdy_status_ok !== false,
      sensorHealthStatus: (st.sensor_health_status as DeviceSensorConfig['sensorHealthStatus']) ?? 'good',
    };
  }

  async getIoConfig(deviceUuid: string, deviceCode: string): Promise<DeviceIoConfig> {
    const [ioRows, stRows] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(`device_io_configs?device_uuid=eq.${deviceUuid}&limit=1`),
      this.rest<Array<Record<string, unknown>>>(`device_status?device_uuid=eq.${deviceUuid}&limit=1`),
    ]);
    let row = ioRows[0];
    if (!row) {
      const ins = await this.rest<Array<Record<string, unknown>>>('device_io_configs', {
        method: 'POST',
        body: JSON.stringify({ device_uuid: deviceUuid }),
      });
      row = ins[0];
    }
    return {
      deviceId: deviceCode,
      statusLedMode: (row.status_led_mode as StatusLedMode) ?? 'inbuilt_rgb',
      statusRgbGpio: Number(row.status_rgb_gpio ?? 48),
      statusSingleLedGpio: Number(row.status_single_led_gpio ?? 2),
      pulseLedEnabled: row.pulse_led_enabled !== false,
      pulseLedGpio: Number(row.pulse_led_gpio ?? 21),
      pulseImpPerKwh: Number(row.pulse_imp_per_kwh ?? 1600),
      offlineBufferEnabled: row.offline_buffer_enabled !== false,
      offlineBufferedCount: Number(stRows[0]?.offline_buffered_count ?? row.offline_buffered_count ?? 0),
    };
  }

  async updateIoConfig(
    deviceUuid: string,
    deviceCode: string,
    patch: Partial<{
      statusLedMode: StatusLedMode;
      statusRgbGpio: number;
      statusSingleLedGpio: number;
      pulseLedEnabled: boolean;
      pulseLedGpio: number;
      pulseImpPerKwh: number;
      offlineBufferEnabled: boolean;
    }>,
  ): Promise<DeviceIoConfig> {
    await this.getIoConfig(deviceUuid, deviceCode);
    const body: Record<string, unknown> = {};
    if (patch.statusLedMode !== undefined) body.status_led_mode = patch.statusLedMode;
    if (patch.statusRgbGpio !== undefined) body.status_rgb_gpio = patch.statusRgbGpio;
    if (patch.statusSingleLedGpio !== undefined) body.status_single_led_gpio = patch.statusSingleLedGpio;
    if (patch.pulseLedEnabled !== undefined) body.pulse_led_enabled = patch.pulseLedEnabled;
    if (patch.pulseLedGpio !== undefined) body.pulse_led_gpio = patch.pulseLedGpio;
    if (patch.pulseImpPerKwh !== undefined) body.pulse_imp_per_kwh = patch.pulseImpPerKwh;
    if (patch.offlineBufferEnabled !== undefined) body.offline_buffer_enabled = patch.offlineBufferEnabled;

    if (Object.keys(body).length > 0) {
      await this.rest(`device_io_configs?device_uuid=eq.${deviceUuid}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    }
    return this.getIoConfig(deviceUuid, deviceCode);
  }

  async ingestTelemetry(input: {
    deviceId: string;
    voltageRms: number;
    currentRms: number;
    activePowerW: number;
    apparentPowerVa: number;
    powerFactor: number;
    frequencyHz: number;
    energyKwh: number;
    deviceTimestamp: string;
    wifiRssiDbm?: number | null;
    seq?: number;
    buffered?: boolean;
  }): Promise<TelemetryIngestResult> {
    const rpcRes = await this.rpc<{
      inserted: boolean;
      isHistoricalBackfill: boolean;
      deviceUuid: string;
      ownerUserId: string;
      lifetimeKwh: number;
      counterResetDetected: boolean;
    }>('sem_ingest_telemetry', {
      p_device_id: input.deviceId.toUpperCase(),
      p_voltage_rms: input.voltageRms,
      p_current_rms: input.currentRms,
      p_active_power_w: input.activePowerW,
      p_apparent_power_va: input.apparentPowerVa,
      p_power_factor: input.powerFactor,
      p_frequency_hz: input.frequencyHz,
      p_energy_kwh: input.energyKwh,
      p_wifi_rssi_dbm: input.wifiRssiDbm ?? null,
      p_message_seq: input.seq ?? null,
      p_device_timestamp: new Date(input.deviceTimestamp).toISOString(),
      p_is_buffered: Boolean(input.buffered),
    });

    const effectiveKwh = rpcRes.isHistoricalBackfill ? input.energyKwh : Number(rpcRes.lifetimeKwh);
    return {
      ...rpcRes,
      point: {
        deviceId: input.deviceId.toUpperCase(),
        voltageRms: input.voltageRms,
        currentRms: input.currentRms,
        activePowerW: input.activePowerW,
        apparentPowerVa: input.apparentPowerVa,
        powerFactor: input.powerFactor,
        frequencyHz: input.frequencyHz,
        energyKwh: effectiveKwh,
        deviceTimestamp: new Date(input.deviceTimestamp).toISOString(),
        ingestedAt: new Date().toISOString(),
        wifiRssiDbm: input.wifiRssiDbm ?? null,
        isValid: true,
      },
    };
  }

  private mapTelemetryRow(r: Record<string, unknown>, deviceCode: string): TelemetryPoint {
    return {
      id: r.id ? String(r.id) : undefined,
      deviceId: deviceCode,
      voltageRms: Number(r.voltage_rms),
      currentRms: Number(r.current_rms),
      activePowerW: Number(r.active_power_w),
      apparentPowerVa: Number(r.apparent_power_va),
      powerFactor: Number(r.power_factor),
      frequencyHz: Number(r.frequency_hz),
      energyKwh: Number(r.energy_kwh),
      deviceTimestamp: new Date(String(r.device_timestamp)).toISOString(),
      ingestedAt: new Date(String(r.ingested_at)).toISOString(),
      wifiRssiDbm: r.wifi_rssi_dbm != null ? Number(r.wifi_rssi_dbm) : null,
      isValid: Boolean(r.is_valid),
    };
  }

  async getLatestTelemetry(deviceUuid: string): Promise<TelemetryPoint | null> {
    const rows = await this.rest<Array<Record<string, unknown>>>(
      `telemetry?device_uuid=eq.${deviceUuid}&is_valid=eq.true&order=device_timestamp.desc&limit=1`,
    );
    if (!rows[0]) return null;
    return this.mapTelemetryRow(rows[0], String(rows[0].device_id));
  }

  async getTelemetryHistory(
    deviceUuid: string,
    deviceCode: string,
    opts: { days?: number; startDate?: string; endDate?: string },
  ) {
    const days = Math.min(365, Math.max(1, opts.days ?? 1));
    const startUtc = opts.startDate
      ? new Date(`${opts.startDate}T00:00:00+05:30`).toISOString()
      : new Date(Date.now() - days * 86_400_000).toISOString();
    const endUtc = opts.endDate
      ? new Date(`${opts.endDate}T23:59:59+05:30`).toISOString()
      : new Date().toISOString();

    const [tRows, dRows] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(
        `telemetry?device_uuid=eq.${deviceUuid}&device_timestamp=gte.${encodeURIComponent(startUtc)}&device_timestamp=lte.${encodeURIComponent(endUtc)}&is_valid=eq.true&order=device_timestamp.asc&limit=5000`,
      ),
      this.rest<Array<Record<string, unknown>>>(
        `energy_daily?device_uuid=eq.${deviceUuid}&order=day_ist.desc&limit=90`,
      ),
    ]);
    const points = tRows.map((r) => this.mapTelemetryRow(r, deviceCode));
    return {
      deviceId: deviceCode,
      points,
      summary: summarizeTelemetry(points),
      daily: dRows.map((d) => ({
        dayIst: String(d.day_ist),
        consumedKwh: Number(d.consumed_kwh),
        peakPowerW: Number(d.peak_power_w ?? 0),
        avgVoltageV: Number(d.avg_voltage_v ?? 0),
        sampleCount: Number(d.sample_count ?? 0),
      })),
    };
  }

  async getEnergyCounter(deviceUuid: string) {
    const rows = await this.rest<Array<Record<string, unknown>>>(`energy_counters?device_uuid=eq.${deviceUuid}&limit=1`);
    const r = rows[0];
    return {
      lifetimeKwh: Number(r?.lifetime_kwh ?? 0),
      counterResetCount: Number(r?.counter_reset_count ?? 0),
      resetOffsetKwh: Number(r?.reset_offset_kwh ?? 0),
    };
  }

  async getDailyRollups(deviceUuid: string, days: number) {
    const rows = await this.rest<Array<Record<string, unknown>>>(
      `energy_daily?device_uuid=eq.${deviceUuid}&order=day_ist.desc&limit=${Math.min(730, Math.max(1, days))}`,
    );
    return rows.map((d) => ({
      dayIst: String(d.day_ist),
      startKwh: Number(d.start_kwh),
      endKwh: Number(d.end_kwh),
      consumedKwh: Number(d.consumed_kwh),
      peakPowerW: Number(d.peak_power_w ?? 0),
      avgPowerW: Number(d.avg_power_w ?? 0),
    }));
  }

  async getMonthlyRollups(deviceUuid: string) {
    const daily = await this.getDailyRollups(deviceUuid, 730);
    const buckets = new Map<string, { consumedKwh: number; peakPowerW: number }>();
    for (const d of daily) {
      const m = String(d.dayIst).slice(0, 7);
      const prev = buckets.get(m) ?? { consumedKwh: 0, peakPowerW: 0 };
      buckets.set(m, {
        consumedKwh: prev.consumedKwh + Number(d.consumedKwh),
        peakPowerW: Math.max(prev.peakPowerW, Number(d.peakPowerW)),
      });
    }
    return Array.from(buckets.entries()).map(([monthIst, v]) => ({
      monthIst,
      consumedKwh: Number(v.consumedKwh.toFixed(4)),
      peakPowerW: Number(v.peakPowerW.toFixed(2)),
    }));
  }

  async markDeviceOffline(deviceCode: string, reason: string): Promise<void> {
    const devs = await this.rest<Array<{ id: string }>>(`devices?device_id=eq.${encodeURIComponent(deviceCode.toUpperCase())}&select=id&limit=1`);
    if (!devs[0]) return;
    await this.rest(`device_status?device_uuid=eq.${devs[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_online: false, last_lwt_at: new Date().toISOString(), last_reset_reason: reason }),
    });
  }

  async updateDeviceStatusFromMqtt(
    deviceCode: string,
    opts: { offlineBufferedCount?: number; version?: string; otaStatus?: OtaJobStatus; otaProgress?: number; otaJobId?: string; otaError?: string; relays?: Array<{ ch: number; state: boolean }> },
  ): Promise<void> {
    const devs = await this.rest<Array<{ id: string }>>(`devices?device_id=eq.${encodeURIComponent(deviceCode.toUpperCase())}&select=id&limit=1`);
    const dev = devs[0];
    if (!dev) return;

    const stPatch: Record<string, unknown> = { is_online: true, last_seen_at: new Date().toISOString() };
    if (opts.offlineBufferedCount !== undefined) stPatch.offline_buffered_count = opts.offlineBufferedCount;
    if (opts.otaStatus !== undefined) stPatch.ota_status = opts.otaStatus;
    await this.rest(`device_status?device_uuid=eq.${dev.id}`, { method: 'PATCH', body: JSON.stringify(stPatch) });

    if (opts.offlineBufferedCount !== undefined) {
      await this.rest(`device_io_configs?device_uuid=eq.${dev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ offline_buffered_count: opts.offlineBufferedCount }),
      });
    }

    if (opts.version) {
      await this.rest(`devices?id=eq.${dev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ firmware_version: opts.version }),
      });
    }

    if (opts.otaStatus) {
      const filter = opts.otaJobId
        ? `firmware_ota_jobs?id=eq.${opts.otaJobId}`
        : `firmware_ota_jobs?device_uuid=eq.${dev.id}&status=in.(queued,downloading,verifying,flashing,rebooting)`;
      await this.rest(filter, {
        method: 'PATCH',
        body: JSON.stringify({
          status: opts.otaStatus,
          ...(opts.otaProgress !== undefined ? { progress_pct: opts.otaProgress } : {}),
          ...(opts.otaError !== undefined ? { error_message: opts.otaError } : {}),
        }),
      });
    }

    if (opts.relays && opts.relays.length > 0) {
      for (const r of opts.relays) {
        await this.rest(`device_relays?device_uuid=eq.${dev.id}&channel_index=eq.${r.ch}`, {
          method: 'PATCH',
          body: JSON.stringify({ current_state: r.state }),
        });
      }
    }
  }

  async pruneOldTelemetry(retentionDays: number) {
    return this.rpc<{ deletedRows: number; retentionDays: number; prunedBeforeUtc: string }>(
      'sem_prune_old_telemetry',
      { p_retention_days: retentionDays },
    );
  }

  async listRelays(deviceUuid: string, deviceCode: string): Promise<DeviceRelay[]> {
    let rows = await this.rest<Array<Record<string, unknown>>>(
      `device_relays?device_uuid=eq.${deviceUuid}&order=channel_index.asc`,
    );
    if (rows.length === 0) {
      rows = await this.rest<Array<Record<string, unknown>>>('device_relays', {
        method: 'POST',
        body: JSON.stringify({
          device_uuid: deviceUuid,
          channel_index: 1,
          name: 'Confirmed Relay 1',
          gpio_pin: 4,
          active_high: true,
          fail_safe_state: false,
          is_confirmed_default: true,
        }),
      });
    }
    const scheds = await this.rest<Array<Record<string, unknown>>>(
      `relay_schedules?device_uuid=eq.${deviceUuid}&order=created_at.asc`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      deviceId: deviceCode,
      channelIndex: Number(r.channel_index),
      name: String(r.name),
      gpioPin: Number(r.gpio_pin),
      activeHigh: Boolean(r.active_high),
      currentState: Boolean(r.current_state),
      failSafeState: Boolean(r.fail_safe_state),
      isConfirmedDefault: Boolean(r.is_confirmed_default),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
      schedules: scheds
        .filter((s) => String(s.relay_id) === String(r.id))
        .map((s) => ({
          id: String(s.id),
          relayId: String(s.relay_id),
          deviceId: deviceCode,
          label: String(s.label),
          startTimeIst: String(s.start_time_ist),
          stopTimeIst: String(s.stop_time_ist),
          daysOfWeek: Array.isArray(s.days_of_week) ? s.days_of_week.map(Number) : [0, 1, 2, 3, 4, 5, 6],
          enabled: Boolean(s.enabled),
          timezone: 'Asia/Kolkata',
          createdAt: new Date(String(s.created_at)).toISOString(),
        })),
    }));
  }

  async addRelay(
    deviceUuid: string,
    deviceCode: string,
    input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean },
  ): Promise<DeviceRelay> {
    if (RESERVED_ESP32_GPIOS.has(input.gpioPin)) {
      throw new WorkerHttpError(400, `GPIO ${input.gpioPin} is reserved for ADS131M02 SPI or Flash.`, 'RESERVED_GPIO');
    }
    const existing = await this.listRelays(deviceUuid, deviceCode);
    if (existing.length >= 8) {
      throw new WorkerHttpError(400, 'Maximum 8 relays supported per ESP32-S3 device.', 'MAX_RELAYS');
    }
    if (existing.some((r) => r.gpioPin === input.gpioPin)) {
      throw new WorkerHttpError(409, `GPIO ${input.gpioPin} is already used by another relay.`, 'DUPLICATE_GPIO');
    }
    const nextChannel = Math.max(...existing.map((r) => r.channelIndex)) + 1;
    const res = await this.rest<Array<Record<string, unknown>>>('device_relays', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: deviceUuid,
        channel_index: nextChannel,
        name: input.name.trim(),
        gpio_pin: input.gpioPin,
        active_high: input.activeHigh,
        current_state: input.failSafeState,
        fail_safe_state: input.failSafeState,
        is_confirmed_default: false,
      }),
    });
    const all = await this.listRelays(deviceUuid, deviceCode);
    return all.find((r) => r.id === String(res[0].id))!;
  }

  async updateRelay(
    deviceUuid: string,
    deviceCode: string,
    relayId: string,
    patch: { name?: string; currentState?: boolean; failSafeState?: boolean; activeHigh?: boolean },
  ): Promise<DeviceRelay> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.currentState !== undefined) body.current_state = patch.currentState;
    if (patch.failSafeState !== undefined) body.fail_safe_state = patch.failSafeState;
    if (patch.activeHigh !== undefined) body.active_high = patch.activeHigh;
    const rows = await this.rest<Array<Record<string, unknown>>>(`device_relays?id=eq.${relayId}&device_uuid=eq.${deviceUuid}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!rows[0]) throw new WorkerHttpError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    const all = await this.listRelays(deviceUuid, deviceCode);
    return all.find((r) => r.id === relayId)!;
  }

  async deleteRelay(deviceUuid: string, relayId: string): Promise<void> {
    const check = await this.rest<Array<{ is_confirmed_default: boolean }>>(
      `device_relays?id=eq.${relayId}&device_uuid=eq.${deviceUuid}&select=is_confirmed_default`,
    );
    if (!check[0]) throw new WorkerHttpError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    if (check[0].is_confirmed_default) {
      throw new WorkerHttpError(400, 'Primary confirmed relay CH1 cannot be deleted.', 'CANNOT_DELETE_DEFAULT_RELAY');
    }
    await this.rest(`device_relays?id=eq.${relayId}&device_uuid=eq.${deviceUuid}`, { method: 'DELETE' });
  }

  async addSchedule(
    deviceUuid: string,
    deviceCode: string,
    relayId: string,
    input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean },
  ): Promise<RelaySchedule> {
    const inserted = await this.rest<Array<Record<string, unknown>>>('relay_schedules', {
      method: 'POST',
      body: JSON.stringify({
        relay_id: relayId,
        device_uuid: deviceUuid,
        label: input.label.trim(),
        start_time_ist: input.startTimeIst,
        stop_time_ist: input.stopTimeIst,
        days_of_week: input.daysOfWeek,
        enabled: input.enabled,
      }),
    });
    const s = inserted[0];
    return {
      id: String(s.id),
      relayId,
      deviceId: deviceCode,
      label: String(s.label),
      startTimeIst: String(s.start_time_ist),
      stopTimeIst: String(s.stop_time_ist),
      daysOfWeek: Array.isArray(s.days_of_week) ? s.days_of_week.map(Number) : input.daysOfWeek,
      enabled: Boolean(s.enabled),
      timezone: 'Asia/Kolkata',
      createdAt: new Date(String(s.created_at)).toISOString(),
    };
  }

  async updateSchedule(
    deviceUuid: string,
    relayId: string,
    scheduleId: string,
    patch: { label?: string; startTimeIst?: string; stopTimeIst?: string; daysOfWeek?: number[]; enabled?: boolean },
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.label !== undefined) body.label = patch.label.trim();
    if (patch.startTimeIst !== undefined) body.start_time_ist = patch.startTimeIst;
    if (patch.stopTimeIst !== undefined) body.stop_time_ist = patch.stopTimeIst;
    if (patch.daysOfWeek !== undefined) body.days_of_week = patch.daysOfWeek;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    const rows = await this.rest<Array<Record<string, unknown>>>(
      `relay_schedules?id=eq.${scheduleId}&relay_id=eq.${relayId}&device_uuid=eq.${deviceUuid}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    if (!rows[0]) throw new WorkerHttpError(404, 'Schedule not found', 'SCHEDULE_NOT_FOUND');
  }

  async deleteSchedule(deviceUuid: string, relayId: string, scheduleId: string): Promise<void> {
    await this.rest(
      `relay_schedules?id=eq.${scheduleId}&relay_id=eq.${relayId}&device_uuid=eq.${deviceUuid}`,
      { method: 'DELETE' },
    );
  }

  async listFirmwareReleases(): Promise<FirmwareReleaseInfo[]> {
    const rows = await this.rest<Array<Record<string, unknown>>>('firmware_versions?order=released_at.desc');
    return rows.map((r) => ({
      id: String(r.id),
      version: String(r.version),
      tagName: r.tag_name ? String(r.tag_name) : `v${r.version}`,
      githubRepo: r.github_repo ? String(r.github_repo) : this.defaultGithubRepo,
      binaryUrl: r.binary_url ? String(r.binary_url) : null,
      checksumSha256: r.checksum_sha256 ? String(r.checksum_sha256) : null,
      releaseNotes: String(r.release_notes ?? ''),
      fileSizeBytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
      releasedAt: new Date(String(r.released_at)).toISOString(),
    }));
  }

  async registerFirmwareRelease(input: {
    version: string;
    tagName?: string;
    githubRepo?: string | null;
    binaryUrl: string;
    checksumSha256?: string | null;
    releaseNotes?: string;
    fileSizeBytes?: number | null;
  }): Promise<FirmwareReleaseInfo> {
    const cleanVer = input.version.replace(/^v/i, '').trim();
    const res = await this.rest<Array<Record<string, unknown>>>('firmware_versions?on_conflict=version', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        version: cleanVer,
        tag_name: input.tagName ?? `v${cleanVer}`,
        github_repo: input.githubRepo ?? this.defaultGithubRepo,
        binary_url: input.binaryUrl,
        checksum_sha256: input.checksumSha256 ?? null,
        release_notes: input.releaseNotes ?? '',
        file_size_bytes: input.fileSizeBytes ?? null,
        released_at: new Date().toISOString(),
      }),
    });
    const list = await this.listFirmwareReleases();
    return list.find((f) => f.id === String(res[0].id))!;
  }

  async getDeviceFirmwareStatus(deviceUuid: string, currentVersion: string) {
    const [releases, jobsRaw] = await Promise.all([
      this.listFirmwareReleases(),
      this.rest<Array<Record<string, unknown>>>(`firmware_ota_jobs?device_uuid=eq.${deviceUuid}&order=created_at.desc&limit=10`),
    ]);
    const latest = releases[0] ?? null;
    const updateAvailable = Boolean(latest?.binaryUrl && compareSemver(latest.version, currentVersion) > 0);
    return {
      currentVersion,
      githubRepo: latest?.githubRepo ?? this.defaultGithubRepo,
      latestRelease: latest ? { ...latest, isUpdateAvailable: updateAvailable } : null,
      updateAvailable,
      jobs: jobsRaw.map((j) => ({
        id: String(j.id),
        deviceId: '',
        targetVersion: String(j.target_version),
        binaryUrl: String(j.binary_url),
        status: j.status as OtaJobStatus,
        progressPct: Number(j.progress_pct ?? 0),
        errorMessage: j.error_message ? String(j.error_message) : null,
        createdAt: new Date(String(j.created_at)).toISOString(),
        updatedAt: new Date(String(j.updated_at)).toISOString(),
      })),
    };
  }

  async createOtaJob(input: {
    deviceUuid: string;
    deviceCode: string;
    userId: string;
    targetVersion?: string;
    binaryUrl?: string;
    checksumSha256?: string;
  }): Promise<FirmwareOtaJob> {
    let url = input.binaryUrl;
    let ver = input.targetVersion?.replace(/^v/i, '');
    let sha = input.checksumSha256 ?? null;
    if (!url) {
      const releases = await this.listFirmwareReleases();
      const latest = releases.find((r) => Boolean(r.binaryUrl));
      if (!latest?.binaryUrl) {
        throw new WorkerHttpError(404, 'No GitHub FOTA firmware release available.', 'NO_FIRMWARE_RELEASE');
      }
      url = latest.binaryUrl;
      ver = latest.version;
      sha = latest.checksumSha256 ?? null;
    }
    const inserted = await this.rest<Array<Record<string, unknown>>>('firmware_ota_jobs', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: input.deviceUuid,
        requested_by_user_id: input.userId,
        target_version: ver ?? 'latest',
        binary_url: url,
        checksum_sha256: sha,
        status: 'queued',
        progress_pct: 0,
      }),
    });
    const j = inserted[0];
    return {
      id: String(j.id),
      deviceId: input.deviceCode,
      targetVersion: String(j.target_version),
      binaryUrl: String(j.binary_url),
      status: j.status as OtaJobStatus,
      progressPct: Number(j.progress_pct),
      createdAt: new Date(String(j.created_at)).toISOString(),
      updatedAt: new Date(String(j.updated_at)).toISOString(),
    };
  }

  async getAllTariffs(): Promise<TariffVersion[]> {
    const [versions, slabs, subs] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>('tariff_versions?order=effective_from.desc'),
      this.rest<Array<Record<string, unknown>>>('tariff_slabs?order=slab_order.asc'),
      this.rest<Array<Record<string, unknown>>>('subsidy_rules'),
    ]);
    if (versions.length === 0) return [INDICATIVE_2026_TNEB_LT1A_TARIFF];
    return versions.map((t) => {
      const sub = subs.find((s) => String(s.tariff_version_id) === String(t.id));
      return {
        id: String(t.id),
        versionCode: String(t.version_code),
        category: String(t.category),
        effectiveFrom: String(t.effective_from),
        effectiveTo: t.effective_to ? String(t.effective_to) : null,
        status: t.status as TariffVersion['status'],
        isIndicative: Boolean(t.is_indicative),
        officialVerified: Boolean(t.official_verified),
        sourceReference: String(t.source_reference),
        slabs: slabs
          .filter((s) => String(s.tariff_version_id) === String(t.id))
          .map((s) => ({
            id: String(s.id),
            slabOrder: Number(s.slab_order),
            branch: s.branch as TariffVersion['slabs'][number]['branch'],
            fromUnit: Number(s.from_unit),
            toUnit: s.to_unit != null ? Number(s.to_unit) : null,
            ratePerUnitInr: Number(s.rate_per_unit_inr),
            fixedChargeInr: Number(s.fixed_charge_inr),
            description: String(s.description),
          })),
        subsidyRule: sub
          ? {
              id: String(sub.id),
              name: String(sub.name),
              freeUnitsUpto500: Number(sub.free_units_upto_500),
              freeUnitsAbove500: Number(sub.free_units_above_500),
              eligibilityRequired: Boolean(sub.eligibility_required),
              notes: String(sub.notes ?? ''),
            }
          : INDICATIVE_2026_TNEB_LT1A_TARIFF.subsidyRule,
      };
    });
  }

  async getActiveTariff(): Promise<TariffVersion> {
    const all = await this.getAllTariffs();
    return all.find((t) => t.status === 'active') ?? all[0] ?? INDICATIVE_2026_TNEB_LT1A_TARIFF;
  }

  async createTariff(adminUserId: string, input: Omit<TariffVersion, 'id' | 'status'>): Promise<TariffVersion> {
    const inserted = await this.rest<Array<Record<string, unknown>>>('tariff_versions', {
      method: 'POST',
      body: JSON.stringify({
        version_code: input.versionCode,
        category: input.category,
        effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo,
        status: 'active',
        is_indicative: input.isIndicative,
        official_verified: input.officialVerified,
        source_reference: input.sourceReference,
        approved_by_user_id: adminUserId,
        approved_at: new Date().toISOString(),
      }),
    });
    const tid = String(inserted[0].id);
    await Promise.all([
      this.rest('tariff_slabs', {
        method: 'POST',
        body: JSON.stringify(
          input.slabs.map((s) => ({
            tariff_version_id: tid,
            slab_order: s.slabOrder,
            branch: s.branch,
            from_unit: s.fromUnit,
            to_unit: s.toUnit,
            rate_per_unit_inr: s.ratePerUnitInr,
            fixed_charge_inr: s.fixedChargeInr,
            description: s.description,
          })),
        ),
      }),
      this.rest('subsidy_rules', {
        method: 'POST',
        body: JSON.stringify({
          tariff_version_id: tid,
          name: input.subsidyRule.name,
          free_units_upto_500: input.subsidyRule.freeUnitsUpto500,
          free_units_above_500: input.subsidyRule.freeUnitsAbove500,
          eligibility_required: input.subsidyRule.eligibilityRequired,
          notes: input.subsidyRule.notes,
        }),
      }),
    ]);
    const all = await this.getAllTariffs();
    return all.find((t) => t.id === tid)!;
  }

  async updateTariffStatus(
    tariffId: string,
    patch: { status?: 'draft' | 'active' | 'archived'; officialVerified?: boolean; isIndicative?: boolean },
  ): Promise<TariffVersion> {
    const body: Record<string, unknown> = {};
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.officialVerified !== undefined) body.official_verified = patch.officialVerified;
    if (patch.isIndicative !== undefined) body.is_indicative = patch.isIndicative;
    await this.rest(`tariff_versions?id=eq.${tariffId}`, { method: 'PATCH', body: JSON.stringify(body) });
    const all = await this.getAllTariffs();
    const found = all.find((t) => t.id === tariffId);
    if (!found) throw new WorkerHttpError(404, 'Tariff not found', 'NOT_FOUND');
    return found;
  }

  async getBillingHistory(userId: string) {
    const [cyclesRaw, estRaw, actRaw, manRaw, devsRaw] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(`billing_cycles?user_id=eq.${userId}&order=period_end.desc`),
      this.rest<Array<Record<string, unknown>>>(`bill_estimates?user_id=eq.${userId}`),
      this.rest<Array<Record<string, unknown>>>(`actual_bills?user_id=eq.${userId}`),
      this.rest<Array<Record<string, unknown>>>(`manual_readings?user_id=eq.${userId}&order=current_reading_date.desc`),
      this.rest<Array<Record<string, unknown>>>('devices?select=id,device_id'),
    ]);
    const devMap = new Map(devsRaw.map((d) => [String(d.id), String(d.device_id)]));
    const cycles: BillingCycleRecord[] = cyclesRaw.map((c) => {
      const est = estRaw.find((e) => String(e.billing_cycle_id) === String(c.id));
      const act = actRaw.find((a) => String(a.billing_cycle_id) === String(c.id));
      const fallbackPayload = INDICATIVE_2026_TNEB_LT1A_TARIFF.versionCode;
      return {
        id: String(c.id),
        deviceId: devMap.get(String(c.device_uuid)) ?? '',
        userId: String(c.user_id),
        periodStart: String(c.period_start),
        periodEnd: String(c.period_end),
        previousReading: Number(c.cycle_start_kwh),
        currentReading: Number(c.cycle_end_kwh),
        unitsConsumed: Number(c.units_consumed),
        readingSource: c.reading_source as 'automatic_esp32' | 'manual_eb_meter',
        estimatedAmountInr: Number(est?.total_estimated_amount_inr ?? 0),
        actualBillAmountInr: act ? Number(act.actual_amount_inr) : null,
        varianceAmountInr: act?.variance_inr != null ? Number(act.variance_inr) : null,
        tariffVersionCode: String((est?.calculation_payload as { tariffVersionCode?: string } | undefined)?.tariffVersionCode ?? fallbackPayload),
        status: c.status as BillingCycleRecord['status'],
        calculationPayload: est?.calculation_payload as BillingCycleRecord['calculationPayload'],
        createdAt: new Date(String(c.created_at)).toISOString(),
      };
    });
    const manualReadings: ManualReadingRecord[] = manRaw.map((m) => ({
      id: String(m.id),
      deviceId: devMap.get(String(m.device_uuid)) ?? '',
      userId: String(m.user_id),
      previousReading: Number(m.previous_reading),
      previousReadingDate: String(m.previous_reading_date),
      currentReading: Number(m.current_reading),
      currentReadingDate: String(m.current_reading_date),
      unitsConsumed: Number(m.units_consumed),
      meterSerialNumber: m.meter_serial_number ? String(m.meter_serial_number) : null,
      notes: m.notes ? String(m.notes) : null,
      automaticComparisonKwh: m.automatic_comparison_kwh != null ? Number(m.automatic_comparison_kwh) : null,
      discrepancyKwh: m.discrepancy_kwh != null ? Number(m.discrepancy_kwh) : null,
      discrepancyPercent: m.discrepancy_percent != null ? Number(m.discrepancy_percent) : null,
      selectedForEstimate: Boolean(m.selected_for_estimate),
      createdAt: new Date(String(m.created_at)).toISOString(),
    }));
    return { cycles, manualReadings };
  }

  async getBillingById(userId: string, cycleId: string): Promise<BillingCycleRecord> {
    const { cycles } = await this.getBillingHistory(userId);
    const found = cycles.find((c) => c.id === cycleId);
    if (!found) throw new WorkerHttpError(404, 'Billing record not found', 'NOT_FOUND');
    return found;
  }

  async persistBillCalculation(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: 'automatic_esp32' | 'manual_eb_meter';
    consumerEligible: boolean;
    fixedChargesInr?: number;
    additionalChargesInr?: number;
  }) {
    const tariff = await this.getActiveTariff();
    const calculation = calculateTnebBill({
      deviceId: input.deviceCode,
      serviceCategory: 'LT-IA',
      consumerEligible: input.consumerEligible,
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      previousReadingDate: input.previousReadingDate,
      currentReadingDate: input.currentReadingDate,
      readingSource: input.readingSource,
      tariffVersion: tariff,
      fixedChargesInr: input.fixedChargesInr,
      additionalChargesInr: input.additionalChargesInr,
    });

    const cycRows = await this.rest<Array<Record<string, unknown>>>('billing_cycles', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: input.deviceUuid,
        user_id: input.userId,
        period_start: input.previousReadingDate,
        period_end: input.currentReadingDate,
        cycle_start_kwh: input.previousReading,
        cycle_end_kwh: input.currentReading,
        units_consumed: calculation.unitsConsumed,
        reading_source: input.readingSource,
        tariff_version_id: tariff.id,
        status: 'estimated',
      }),
    });
    const cycId = String(cycRows[0].id);
    await this.rest('bill_estimates', {
      method: 'POST',
      body: JSON.stringify({
        billing_cycle_id: cycId,
        device_uuid: input.deviceUuid,
        user_id: input.userId,
        tariff_version_id: tariff.id,
        reading_source: input.readingSource,
        consumer_eligible: input.consumerEligible,
        previous_reading: input.previousReading,
        current_reading: input.currentReading,
        units_consumed: calculation.unitsConsumed,
        free_units_applied: calculation.freeUnitsApplied,
        energy_charges_inr: calculation.energyChargesInr,
        fixed_charges_inr: calculation.fixedChargesInr,
        additional_charges_inr: calculation.additionalChargesInr,
        total_estimated_amount_inr: calculation.totalEstimatedAmountInr,
        calculation_payload: calculation,
      }),
    });

    const cycle = await this.getBillingById(input.userId, cycId);
    return { cycle, calculation };
  }

  async submitManualReading(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    consumerEligible: boolean;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    notes?: string;
    preferredSource?: 'automatic_esp32' | 'manual_eb_meter';
  }) {
    const counter = await this.getEnergyCounter(input.deviceUuid);
    const unitsConsumed = Number((input.currentReading - input.previousReading).toFixed(4));
    const discrepancyKwh = Number((unitsConsumed - counter.lifetimeKwh).toFixed(4));
    const discrepancyPct = counter.lifetimeKwh > 0 ? Number(((Math.abs(discrepancyKwh) / counter.lifetimeKwh) * 100).toFixed(2)) : 0;

    const manRows = await this.rest<Array<Record<string, unknown>>>('manual_readings', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: input.deviceUuid,
        user_id: input.userId,
        previous_reading: input.previousReading,
        previous_reading_date: input.previousReadingDate,
        current_reading: input.currentReading,
        current_reading_date: input.currentReadingDate,
        units_consumed: unitsConsumed,
        meter_serial_number: input.meterSerialNumber ?? null,
        notes: input.notes ?? null,
        automatic_comparison_kwh: counter.lifetimeKwh,
        discrepancy_kwh: discrepancyKwh,
        discrepancy_percent: discrepancyPct,
        selected_for_estimate: input.preferredSource !== 'automatic_esp32',
      }),
    });
    const m = manRows[0];
    const billRes = await this.persistBillCalculation({
      userId: input.userId,
      deviceUuid: input.deviceUuid,
      deviceCode: input.deviceCode,
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      previousReadingDate: input.previousReadingDate,
      currentReadingDate: input.currentReadingDate,
      readingSource: input.preferredSource ?? 'manual_eb_meter',
      consumerEligible: input.consumerEligible,
    });
    return {
      manualReading: {
        id: String(m.id),
        deviceId: input.deviceCode,
        userId: input.userId,
        previousReading: Number(m.previous_reading),
        previousReadingDate: String(m.previous_reading_date),
        currentReading: Number(m.current_reading),
        currentReadingDate: String(m.current_reading_date),
        unitsConsumed: Number(m.units_consumed),
        meterSerialNumber: m.meter_serial_number ? String(m.meter_serial_number) : null,
        notes: m.notes ? String(m.notes) : null,
        automaticComparisonKwh: Number(m.automatic_comparison_kwh),
        discrepancyKwh: Number(m.discrepancy_kwh),
        discrepancyPercent: Number(m.discrepancy_percent),
        selectedForEstimate: Boolean(m.selected_for_estimate),
        createdAt: new Date(String(m.created_at)).toISOString(),
      },
      ...billRes,
    };
  }

  async recordActualBill(userId: string, cycleId: string, actualAmountInr: number, officialBillNumber?: string) {
    const cyc = await this.getBillingById(userId, cycleId);
    const devRows = await this.rest<Array<{ id: string }>>(`devices?device_id=eq.${cyc.deviceId}&select=id&limit=1`);
    const variance = Number((actualAmountInr - cyc.estimatedAmountInr).toFixed(2));
    await this.rest('actual_bills?on_conflict=billing_cycle_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        billing_cycle_id: cycleId,
        device_uuid: devRows[0].id,
        user_id: userId,
        actual_amount_inr: actualAmountInr,
        official_bill_number: officialBillNumber ?? null,
        variance_inr: variance,
      }),
    });
    await this.rest(`billing_cycles?id=eq.${cycleId}`, { method: 'PATCH', body: JSON.stringify({ status: 'billed' }) });
    return this.getBillingById(userId, cycleId);
  }

  async evaluateAlerts(point: TelemetryPoint, deviceUuid: string, ownerUserId: string): Promise<AlertEvent[]> {
    const rules = await this.rest<Array<Record<string, unknown>>>(
      `alert_rules?device_uuid=eq.${deviceUuid}&enabled=eq.true`,
    );
    const created: AlertEvent[] = [];
    for (const r of rules) {
      const alertType = String(r.alert_type) as AlertEvent['alertType'];
      const threshold = Number(r.threshold_value);
      const sec = r.secondary_threshold != null ? Number(r.secondary_threshold) : null;
      const op = String(r.comparison_operator);
      let obs: number | null = null;
      if (alertType === 'high_current' || alertType === 'overcurrent_warning') obs = point.currentRms;
      else if (alertType === 'high_power' || alertType === 'unusual_consumption') obs = point.activePowerW;
      else if (alertType === 'abnormal_voltage') obs = point.voltageRms;
      else if (alertType === 'low_power_factor') obs = point.powerFactor;
      if (obs === null) continue;

      const hit =
        (op === 'gt' && obs > threshold) ||
        (op === 'lt' && obs < threshold) ||
        (op === 'outside_range' && sec !== null && (obs < threshold || obs > sec));
      if (!hit) continue;

      const msg = `Advisory alert (${alertType.replaceAll('_', ' ')}): observed ${obs} vs threshold ${threshold}. Not an electrical protection trip.`;
      const ins = await this.rest<Array<Record<string, unknown>>>('alerts', {
        method: 'POST',
        body: JSON.stringify({
          device_uuid: deviceUuid,
          user_id: ownerUserId,
          alert_type: alertType,
          threshold_value: threshold,
          observed_value: obs,
          severity: r.severity,
          status: 'active',
          message: msg,
        }),
      });
      created.push({
        id: String(ins[0].id),
        deviceId: point.deviceId,
        userId: ownerUserId,
        alertType,
        thresholdValue: threshold,
        observedValue: obs,
        severity: r.severity as AlertEvent['severity'],
        status: 'active',
        message: msg,
        createdAt: new Date(String(ins[0].created_at)).toISOString(),
      });
    }
    return created;
  }

  async createDeviceAlert(
    deviceCode: string,
    alertType: AlertEvent['alertType'],
    observed: number,
    message: string,
    severity: AlertEvent['severity'] = 'warning',
  ): Promise<void> {
    const devs = await this.rest<Array<{ id: string; owner_user_id: string }>>(
      `devices?device_id=eq.${encodeURIComponent(deviceCode.toUpperCase())}&select=id,owner_user_id&limit=1`,
    );
    if (!devs[0]) return;
    await this.rest('alerts', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: devs[0].id,
        user_id: devs[0].owner_user_id,
        alert_type: alertType,
        threshold_value: 0,
        observed_value: observed,
        severity,
        status: 'active',
        message,
      }),
    });
  }

  async listAlerts(userId: string, role: UserRole) {
    const [aRaw, rRaw, devs] = await Promise.all([
      this.rest<Array<Record<string, unknown>>>(
        role === 'admin' ? 'alerts?order=created_at.desc&limit=200' : `alerts?user_id=eq.${userId}&order=created_at.desc&limit=200`,
      ),
      this.rest<Array<Record<string, unknown>>>(
        role === 'admin' ? 'alert_rules?order=created_at.desc' : `alert_rules?user_id=eq.${userId}&order=created_at.desc`,
      ),
      this.rest<Array<{ id: string; device_id: string }>>('devices?select=id,device_id'),
    ]);
    const devMap = new Map(devs.map((d) => [d.id, d.device_id]));
    return {
      alerts: aRaw.map((a) => ({
        id: String(a.id),
        deviceId: devMap.get(String(a.device_uuid)) ?? '',
        userId: String(a.user_id),
        alertType: a.alert_type as AlertEvent['alertType'],
        thresholdValue: Number(a.threshold_value),
        observedValue: Number(a.observed_value),
        severity: a.severity as AlertEvent['severity'],
        status: a.status as AlertEvent['status'],
        message: String(a.message),
        acknowledgedAt: a.acknowledged_at ? new Date(String(a.acknowledged_at)).toISOString() : null,
        createdAt: new Date(String(a.created_at)).toISOString(),
      })),
      rules: rRaw.map((r) => ({
        id: String(r.id),
        deviceId: devMap.get(String(r.device_uuid)) ?? '',
        userId: String(r.user_id),
        alertType: r.alert_type as AlertRule['alertType'],
        thresholdValue: Number(r.threshold_value),
        comparisonOperator: r.comparison_operator as AlertRule['comparisonOperator'],
        secondaryThreshold: r.secondary_threshold != null ? Number(r.secondary_threshold) : null,
        severity: r.severity as AlertRule['severity'],
        enabled: Boolean(r.enabled),
        pushEnabled: Boolean(r.push_enabled),
        createdAt: new Date(String(r.created_at)).toISOString(),
      })),
    };
  }

  async acknowledgeAlert(alertId: string, userId: string, role: UserRole): Promise<void> {
    const query = role === 'admin' ? `alerts?id=eq.${alertId}` : `alerts?id=eq.${alertId}&user_id=eq.${userId}`;
    await this.rest(query, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: userId }),
    });
  }

  async createAlertRule(userId: string, deviceUuid: string, deviceCode: string, rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>): Promise<AlertRule> {
    const rows = await this.rest<Array<Record<string, unknown>>>('alert_rules', {
      method: 'POST',
      body: JSON.stringify({
        device_uuid: deviceUuid,
        user_id: userId,
        alert_type: rule.alertType,
        threshold_value: rule.thresholdValue,
        comparison_operator: rule.comparisonOperator,
        secondary_threshold: rule.secondaryThreshold ?? null,
        severity: rule.severity,
        enabled: rule.enabled,
        push_enabled: rule.pushEnabled,
      }),
    });
    const r = rows[0];
    return { ...rule, id: String(r.id), deviceId: deviceCode, userId, createdAt: new Date(String(r.created_at)).toISOString() };
  }

  async updateAlertRule(
    ruleId: string,
    userId: string,
    role: UserRole,
    patch: Partial<Pick<AlertRule, 'thresholdValue' | 'enabled' | 'pushEnabled' | 'severity'>>,
  ): Promise<AlertRule> {
    const body: Record<string, unknown> = {};
    if (patch.thresholdValue !== undefined) body.threshold_value = patch.thresholdValue;
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.pushEnabled !== undefined) body.push_enabled = patch.pushEnabled;
    if (patch.severity !== undefined) body.severity = patch.severity;
    const query = role === 'admin' ? `alert_rules?id=eq.${ruleId}` : `alert_rules?id=eq.${ruleId}&user_id=eq.${userId}`;
    const rows = await this.rest<Array<Record<string, unknown>>>(query, { method: 'PATCH', body: JSON.stringify(body) });
    if (!rows[0]) throw new WorkerHttpError(404, 'Alert rule not found', 'NOT_FOUND');
    const r = rows[0];
    return {
      id: String(r.id),
      deviceId: '',
      userId: String(r.user_id),
      alertType: r.alert_type as AlertRule['alertType'],
      thresholdValue: Number(r.threshold_value),
      comparisonOperator: r.comparison_operator as AlertRule['comparisonOperator'],
      secondaryThreshold: r.secondary_threshold != null ? Number(r.secondary_threshold) : null,
      severity: r.severity as AlertRule['severity'],
      enabled: Boolean(r.enabled),
      pushEnabled: Boolean(r.push_enabled),
      createdAt: new Date(String(r.created_at)).toISOString(),
    };
  }

  async listAllUsers() {
    return this.rest<Array<Record<string, unknown>>>(
      'users?select=id,full_name,email,mobile_number,role,organization,is_active,created_at&order=created_at.desc',
    );
  }

  async assignDeviceOwnership(deviceCodeOrUuid: string, newOwnerId: string): Promise<Device> {
    const dev = await this.resolveAuthorizedDevice(deviceCodeOrUuid, newOwnerId, 'admin');
    const rows = await this.rest<Array<Record<string, unknown>>>(`devices?id=eq.${dev.uuid}`, {
      method: 'PATCH',
      body: JSON.stringify({ owner_user_id: newOwnerId }),
    });
    return toPublicDevice(this.mapInternalDevice(rows[0]));
  }

  async getPlatformStats() {
    const [u, d, t, a] = await Promise.all([
      this.rest<Array<{ id: string }>>('users?select=id'),
      this.rest<Array<{ id: string }>>('devices?select=id'),
      this.rest<Array<{ id: string }>>('telemetry?select=id&limit=10000'),
      this.rest<Array<{ id: string }>>("alerts?status=eq.active&select=id"),
    ]);
    return { users: u.length, devices: d.length, telemetryRows: t.length, activeAlerts: a.length };
  }
}

/**
 * In-memory deterministic store for Worker unit & EMQX webhook integration testing.
 */
export class MemoryWorkerStore implements WorkerStore {
  readonly engine = 'memory-test';
  private users: Array<UserProfile & { passwordHash: string }> = [];
  private revokedJtis = new Set<string>();
  private resetTokens = new Map<string, { userId: string; expiresAt: number }>();
  private devices = new Map<string, InternalDevice>();
  private sensorConfigs = new Map<string, DeviceSensorConfig>();
  private ioConfigs = new Map<string, DeviceIoConfig>();
  private telemetry = new Map<string, TelemetryPoint[]>();
  private counters = new Map<string, { lifetimeKwh: number; lastReported: number; resetOffsetKwh: number; counterResetCount: number }>();
  private daily = new Map<string, Map<string, { dayIst: string; startKwh: number; endKwh: number; consumedKwh: number; peakPowerW: number; avgPowerSum: number; avgVoltSum: number; count: number }>>();
  private relays = new Map<string, DeviceRelay[]>();
  private releases: FirmwareReleaseInfo[] = [];
  private otaJobs: FirmwareOtaJob[] = [];
  private tariffs: TariffVersion[] = [{ ...INDICATIVE_2026_TNEB_LT1A_TARIFF }];
  private billingCycles: BillingCycleRecord[] = [];
  private billingUserMap = new Map<string, string>();
  private manualReadings: ManualReadingRecord[] = [];
  private manualUserMap = new Map<string, string>();
  private alertRules: Array<AlertRule & { deviceUuid: string }> = [];
  private alerts: Array<AlertEvent & { deviceUuid: string }> = [];

  async isTokenRevoked(jti: string) { return this.revokedJtis.has(jti); }
  async revokeToken(jti: string) { this.revokedJtis.add(jti); }

  async seedAdmin(input: { fullName: string; email: string; mobileNumber: string; password: string }): Promise<UserProfile> {
    const u = await this.registerUser(input);
    const ref = this.users.find((x) => x.id === u.id)!;
    ref.role = 'admin';
    return { ...ref };
  }

  async registerUser(input: { fullName: string; email: string; mobileNumber: string; password: string; organization?: string }): Promise<UserProfile> {
    const emailNorm = input.email.trim().toLowerCase();
    const mobileNorm = input.mobileNumber.trim();
    if (this.users.some((u) => u.email === emailNorm || u.mobileNumber === mobileNorm)) {
      throw new WorkerHttpError(409, 'An account with this email or mobile number already exists.', 'DUPLICATE_USER');
    }
    const now = new Date().toISOString();
    const rec = {
      id: crypto.randomUUID(),
      fullName: input.fullName.trim(),
      email: emailNorm,
      mobileNumber: mobileNorm,
      role: 'user' as UserRole,
      organization: input.organization?.trim() || null,
      avatarUrl: null,
      themePreference: 'light' as const,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      passwordHash: await hashPassword(input.password),
    };
    this.users.push(rec);
    const { passwordHash: _p, ...pub } = rec;
    return pub;
  }

  async verifyUserLogin(identifier: string, password: string): Promise<UserProfile> {
    const clean = identifier.trim().toLowerCase();
    const rec = this.users.find((u) => u.email === clean || u.mobileNumber === identifier.trim());
    if (!rec || !(await verifyPassword(password, rec.passwordHash))) {
      throw new WorkerHttpError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }
    const { passwordHash: _p, ...pub } = rec;
    return pub;
  }

  async getUserById(userId: string) {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    const { passwordHash: _p, ...pub } = u;
    return pub;
  }

  async updateUserProfile(userId: string, patch: Partial<UserProfile>) {
    const u = this.users.find((x) => x.id === userId);
    if (!u) throw new WorkerHttpError(404, 'User not found', 'NOT_FOUND');
    Object.assign(u, patch, { updatedAt: new Date().toISOString() });
    const { passwordHash: _p, ...pub } = u;
    return pub;
  }

  async changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
    const u = this.users.find((x) => x.id === userId);
    if (!u || !(await verifyPassword(currentPassword, u.passwordHash))) {
      throw new WorkerHttpError(401, 'Current password is incorrect.', 'INVALID_PASSWORD');
    }
    u.passwordHash = await hashPassword(newPassword);
  }

  async createResetToken(email: string) {
    const u = this.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u) return null;
    const raw = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    this.resetTokens.set(await sha256Hex(raw), { userId: u.id, expiresAt: Date.now() + 1800_000 });
    return raw;
  }

  async consumeResetToken(token: string, newPassword: string) {
    const rec = this.resetTokens.get(await sha256Hex(token));
    if (!rec || rec.expiresAt < Date.now()) throw new WorkerHttpError(400, 'Invalid reset token', 'INVALID_RESET_TOKEN');
    const u = this.users.find((x) => x.id === rec.userId)!;
    u.passwordHash = await hashPassword(newPassword);
  }

  async listDevices(userId: string, role: UserRole) {
    return Array.from(this.devices.values())
      .filter((d) => role === 'admin' || d.ownerUserId === userId || d.sharedUserIds.includes(userId))
      .map(toPublicDevice);
  }

  async resolveAuthorizedDevice(deviceCodeOrUuid: string, userId: string, role: UserRole) {
    const clean = deviceCodeOrUuid.trim();
    const d = Array.from(this.devices.values()).find((x) => x.uuid === clean || x.deviceId === clean.toUpperCase());
    if (!d) throw new WorkerHttpError(404, 'Device not found', 'DEVICE_NOT_FOUND');
    if (role !== 'admin' && d.ownerUserId !== userId && !d.sharedUserIds.includes(userId)) {
      throw new WorkerHttpError(403, 'Forbidden device access', 'FORBIDDEN_DEVICE');
    }
    return d;
  }

  async createDevice(ownerUserId: string, input: { deviceId: string; name: string; locationLabel?: string; serviceCategory: string; consumerEligibleForSubsidy: boolean; meterSerialNumber?: string }) {
    const code = input.deviceId.trim().toUpperCase();
    if (Array.from(this.devices.values()).some((d) => d.deviceId === code)) {
      throw new WorkerHttpError(409, `Device ${code} already paired.`, 'DEVICE_EXISTS');
    }
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    const dev: InternalDevice = {
      uuid,
      deviceId: code,
      ownerUserId,
      sharedUserIds: [],
      name: input.name.trim(),
      locationLabel: input.locationLabel?.trim() || null,
      serviceCategory: input.serviceCategory || 'LT-IA',
      consumerEligibleForSubsidy: input.consumerEligibleForSubsidy,
      meterSerialNumber: input.meterSerialNumber?.trim() || null,
      firmwareVersion: '1.2.0',
      hardwareVersion: 'ESP32-S3-ADS131M02-REV2',
      telemetryIntervalSec: 15,
      monitoringMode: 'automatic',
      isOnline: false,
      wifiRssiDbm: null,
      lastSeenAt: null,
      offlineBufferedCount: 0,
      otaStatus: 'idle',
      createdAt: now,
      updatedAt: now,
    };
    this.devices.set(uuid, dev);
    this.sensorConfigs.set(uuid, {
      deviceId: code,
      voltageSensorModel: 'ZMPT101B',
      currentSensorModel: 'SCT-013 (30A / 1V built-in burden)',
      adcModel: 'ADS131M02',
      voltageCalibrationFactor: 1.0,
      currentCalibrationFactor: 1.0,
      phaseCorrectionDeg: 0,
      nominalFrequencyHz: 50,
      calibrationDate: null,
      calibrationStatus: 'factory_default',
      adcSpiOk: true,
      drdyStatusOk: true,
      sensorHealthStatus: 'good',
    });
    this.ioConfigs.set(uuid, {
      deviceId: code,
      statusLedMode: 'inbuilt_rgb',
      statusRgbGpio: 48,
      statusSingleLedGpio: 2,
      pulseLedEnabled: true,
      pulseLedGpio: 21,
      pulseImpPerKwh: 1600,
      offlineBufferEnabled: true,
      offlineBufferedCount: 0,
    });
    this.counters.set(uuid, { lifetimeKwh: 0, lastReported: 0, resetOffsetKwh: 0, counterResetCount: 0 });
    this.relays.set(uuid, [
      {
        id: crypto.randomUUID(),
        deviceId: code,
        channelIndex: 1,
        name: 'Confirmed Relay 1',
        gpioPin: 4,
        activeHigh: true,
        currentState: false,
        failSafeState: false,
        isConfirmedDefault: true,
        updatedAt: now,
        schedules: [],
      },
    ]);
    return {
      device: toPublicDevice(dev),
      mqttUsername: `sem_${code.toLowerCase()}`,
      mqttPassword: crypto.randomUUID().replaceAll('-', ''),
    };
  }

  async updateDevice(deviceUuid: string, _actor: string, role: UserRole, patch: Record<string, unknown>) {
    if (patch.sensorConfig && role !== 'admin') {
      throw new WorkerHttpError(403, 'Only administrators may modify calibration constants.', 'ADMIN_REQUIRED');
    }
    const d = this.devices.get(deviceUuid)!;
    if (typeof patch.name === 'string') d.name = patch.name.trim();
    if (patch.telemetryIntervalSec !== undefined) d.telemetryIntervalSec = Number(patch.telemetryIntervalSec);
    if (typeof patch.monitoringMode === 'string') d.monitoringMode = patch.monitoringMode as InternalDevice['monitoringMode'];
    if (patch.sensorConfig && typeof patch.sensorConfig === 'object') {
      Object.assign(this.sensorConfigs.get(deviceUuid)!, patch.sensorConfig, {
        calibrationDate: new Date().toISOString().slice(0, 10),
      });
    }
    d.updatedAt = new Date().toISOString();
    return toPublicDevice(d);
  }

  async deleteDevice(deviceUuid: string) { this.devices.delete(deviceUuid); }
  async getSensorConfig(deviceUuid: string) { return this.sensorConfigs.get(deviceUuid)!; }
  async getIoConfig(deviceUuid: string) { return this.ioConfigs.get(deviceUuid)!; }
  async updateIoConfig(deviceUuid: string, _code: string, patch: Partial<DeviceIoConfig>) {
    const cfg = this.ioConfigs.get(deviceUuid)!;
    Object.assign(cfg, patch);
    return cfg;
  }

  async ingestTelemetry(input: {
    deviceId: string;
    voltageRms: number;
    currentRms: number;
    activePowerW: number;
    apparentPowerVa: number;
    powerFactor: number;
    frequencyHz: number;
    energyKwh: number;
    deviceTimestamp: string;
    wifiRssiDbm?: number | null;
    buffered?: boolean;
  }): Promise<TelemetryIngestResult> {
    const dev = Array.from(this.devices.values()).find((d) => d.deviceId === input.deviceId.toUpperCase());
    if (!dev) throw new WorkerHttpError(404, 'Unknown device', 'DEVICE_NOT_FOUND');

    const series = this.telemetry.get(dev.uuid) ?? [];
    const tsIso = new Date(input.deviceTimestamp).toISOString();
    const maxTs = series.reduce<number | null>((m, p) => {
      const t = Date.parse(p.deviceTimestamp);
      return m === null || t > m ? t : m;
    }, null);
    const isHistoricalBackfill = maxTs !== null && Date.parse(tsIso) < maxTs;

    const ctr = this.counters.get(dev.uuid)!;
    let resetDetected = false;
    if (!isHistoricalBackfill) {
      if (ctr.lastReported > 0 && input.energyKwh + 0.001 < ctr.lastReported) {
        resetDetected = true;
        ctr.counterResetCount++;
        ctr.resetOffsetKwh += ctr.lastReported;
      }
      ctr.lastReported = input.energyKwh;
      ctr.lifetimeKwh = Math.max(ctr.lifetimeKwh, ctr.resetOffsetKwh + input.energyKwh);
    }

    const effKwh = isHistoricalBackfill ? input.energyKwh : ctr.lifetimeKwh;
    const dup = series.some((p) => p.deviceTimestamp === tsIso);
    const point: TelemetryPoint = {
      id: crypto.randomUUID(),
      deviceId: dev.deviceId,
      voltageRms: input.voltageRms,
      currentRms: input.currentRms,
      activePowerW: input.activePowerW,
      apparentPowerVa: input.apparentPowerVa,
      powerFactor: input.powerFactor,
      frequencyHz: input.frequencyHz,
      energyKwh: effKwh,
      deviceTimestamp: tsIso,
      ingestedAt: new Date().toISOString(),
      wifiRssiDbm: input.wifiRssiDbm ?? null,
      isValid: true,
    };
    if (!dup) {
      series.push(point);
      this.telemetry.set(dev.uuid, series);
      const dayKey = formatKolkataDate(tsIso);
      const devDays = this.daily.get(dev.uuid) ?? new Map();
      const prev = devDays.get(dayKey);
      if (!prev) {
        devDays.set(dayKey, {
          dayIst: dayKey,
          startKwh: effKwh,
          endKwh: effKwh,
          consumedKwh: 0,
          peakPowerW: input.activePowerW,
          avgPowerSum: input.activePowerW,
          avgVoltSum: input.voltageRms,
          count: 1,
        });
      } else {
        prev.startKwh = Math.min(prev.startKwh, effKwh);
        prev.endKwh = Math.max(prev.endKwh, effKwh);
        prev.consumedKwh = Math.max(0, prev.endKwh - prev.startKwh);
        prev.peakPowerW = Math.max(prev.peakPowerW, input.activePowerW);
        prev.avgPowerSum += input.activePowerW;
        prev.avgVoltSum += input.voltageRms;
        prev.count++;
      }
      this.daily.set(dev.uuid, devDays);
    }

    if (!isHistoricalBackfill) {
      dev.isOnline = true;
      dev.wifiRssiDbm = input.wifiRssiDbm ?? dev.wifiRssiDbm;
      dev.lastSeenAt = new Date().toISOString();
    }

    return {
      inserted: !dup,
      isHistoricalBackfill,
      deviceUuid: dev.uuid,
      ownerUserId: dev.ownerUserId,
      lifetimeKwh: ctr.lifetimeKwh,
      counterResetDetected: resetDetected,
      point,
    };
  }

  async getLatestTelemetry(deviceUuid: string) {
    const pts = [...(this.telemetry.get(deviceUuid) ?? [])].sort((a, b) => Date.parse(b.deviceTimestamp) - Date.parse(a.deviceTimestamp));
    return pts[0] ?? null;
  }

  async getTelemetryHistory(deviceUuid: string, deviceCode: string, opts: { days?: number; startDate?: string; endDate?: string }) {
    const days = opts.days ?? 1;
    const minMs = opts.startDate ? Date.parse(`${opts.startDate}T00:00:00+05:30`) : Date.now() - days * 86_400_000;
    const maxMs = opts.endDate ? Date.parse(`${opts.endDate}T23:59:59+05:30`) : Date.now();
    const pts = (this.telemetry.get(deviceUuid) ?? [])
      .filter((p) => {
        const ms = Date.parse(p.deviceTimestamp);
        return ms >= minMs && ms <= maxMs;
      })
      .sort((a, b) => Date.parse(a.deviceTimestamp) - Date.parse(b.deviceTimestamp));
    const daily = await this.getDailyRollups(deviceUuid, days);
    return { deviceId: deviceCode, points: pts, summary: summarizeTelemetry(pts), daily };
  }

  async getEnergyCounter(deviceUuid: string) {
    const c = this.counters.get(deviceUuid)!;
    return { lifetimeKwh: c.lifetimeKwh, counterResetCount: c.counterResetCount, resetOffsetKwh: c.resetOffsetKwh };
  }

  async getDailyRollups(deviceUuid: string, days = 30) {
    const m = this.daily.get(deviceUuid);
    if (!m) return [];
    return Array.from(m.values()).slice(-days).map((d) => ({
      dayIst: d.dayIst,
      startKwh: d.startKwh,
      endKwh: d.endKwh,
      consumedKwh: d.consumedKwh,
      peakPowerW: d.peakPowerW,
      avgPowerW: d.avgPowerSum / d.count,
    }));
  }

  async getMonthlyRollups(deviceUuid: string) {
    const rows = await this.getDailyRollups(deviceUuid);
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.dayIst).slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + Number(r.consumedKwh));
    }
    return Array.from(m.entries()).map(([monthIst, consumedKwh]) => ({ monthIst, consumedKwh }));
  }

  async markDeviceOffline(deviceCode: string) {
    const dev = Array.from(this.devices.values()).find((d) => d.deviceId === deviceCode.toUpperCase());
    if (dev) dev.isOnline = false;
  }

  async updateDeviceStatusFromMqtt(
    deviceCode: string,
    opts: { offlineBufferedCount?: number; version?: string; otaStatus?: OtaJobStatus; otaProgress?: number; otaJobId?: string; otaError?: string; relays?: Array<{ ch: number; state: boolean }> },
  ) {
    const dev = Array.from(this.devices.values()).find((d) => d.deviceId === deviceCode.toUpperCase());
    if (!dev) return;
    dev.isOnline = true;
    dev.lastSeenAt = new Date().toISOString();
    if (opts.offlineBufferedCount !== undefined) {
      dev.offlineBufferedCount = opts.offlineBufferedCount;
      this.ioConfigs.get(dev.uuid)!.offlineBufferedCount = opts.offlineBufferedCount;
    }
    if (opts.version) dev.firmwareVersion = opts.version;
    if (opts.otaStatus) {
      dev.otaStatus = opts.otaStatus;
      for (const j of this.otaJobs) {
        if ((opts.otaJobId && j.id === opts.otaJobId) || (j.deviceId === dev.deviceId && j.status !== 'succeeded' && j.status !== 'failed')) {
          j.status = opts.otaStatus;
          if (opts.otaProgress !== undefined) j.progressPct = opts.otaProgress;
          if (opts.otaError !== undefined) j.errorMessage = opts.otaError;
        }
      }
    }
    if (opts.relays) {
      const rList = this.relays.get(dev.uuid) ?? [];
      for (const u of opts.relays) {
        const r = rList.find((x) => x.channelIndex === u.ch);
        if (r) r.currentState = u.state;
      }
    }
  }

  async pruneOldTelemetry(retentionDays: number) {
    const days = Math.max(7, retentionDays);
    const cutoffMs = Date.now() - days * 86_400_000;
    let deleted = 0;
    for (const [uuid, pts] of this.telemetry.entries()) {
      const kept = pts.filter((p) => {
        const keep = Date.parse(p.deviceTimestamp) >= cutoffMs;
        if (!keep) deleted++;
        return keep;
      });
      this.telemetry.set(uuid, kept);
    }
    return { deletedRows: deleted, retentionDays: days, prunedBeforeUtc: new Date(cutoffMs).toISOString() };
  }

  async listRelays(deviceUuid: string) { return this.relays.get(deviceUuid) ?? []; }

  async addRelay(deviceUuid: string, deviceCode: string, input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean }) {
    if (RESERVED_ESP32_GPIOS.has(input.gpioPin)) {
      throw new WorkerHttpError(400, `GPIO ${input.gpioPin} is reserved.`, 'RESERVED_GPIO');
    }
    const list = this.relays.get(deviceUuid) ?? [];
    if (list.some((r) => r.gpioPin === input.gpioPin)) {
      throw new WorkerHttpError(409, `GPIO ${input.gpioPin} already in use.`, 'DUPLICATE_GPIO');
    }
    const r: DeviceRelay = {
      id: crypto.randomUUID(),
      deviceId: deviceCode,
      channelIndex: list.length + 1,
      name: input.name.trim(),
      gpioPin: input.gpioPin,
      activeHigh: input.activeHigh,
      currentState: input.failSafeState,
      failSafeState: input.failSafeState,
      isConfirmedDefault: false,
      updatedAt: new Date().toISOString(),
      schedules: [],
    };
    list.push(r);
    return r;
  }

  async updateRelay(deviceUuid: string, _code: string, relayId: string, patch: Partial<DeviceRelay>) {
    const r = (this.relays.get(deviceUuid) ?? []).find((x) => x.id === relayId);
    if (!r) throw new WorkerHttpError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return r;
  }

  async deleteRelay(deviceUuid: string, relayId: string) {
    const list = this.relays.get(deviceUuid) ?? [];
    const target = list.find((r) => r.id === relayId);
    if (!target) throw new WorkerHttpError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    if (target.isConfirmedDefault) throw new WorkerHttpError(400, 'Cannot delete CH1', 'CANNOT_DELETE_DEFAULT_RELAY');
    this.relays.set(deviceUuid, list.filter((r) => r.id !== relayId));
  }

  async addSchedule(deviceUuid: string, deviceCode: string, relayId: string, input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean }) {
    const r = (this.relays.get(deviceUuid) ?? []).find((x) => x.id === relayId);
    if (!r) throw new WorkerHttpError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    const s: RelaySchedule = {
      id: crypto.randomUUID(),
      relayId,
      deviceId: deviceCode,
      label: input.label.trim(),
      startTimeIst: input.startTimeIst,
      stopTimeIst: input.stopTimeIst,
      daysOfWeek: input.daysOfWeek,
      enabled: input.enabled,
      timezone: 'Asia/Kolkata',
      createdAt: new Date().toISOString(),
    };
    r.schedules.push(s);
    return s;
  }

  async updateSchedule(deviceUuid: string, relayId: string, scheduleId: string, patch: Partial<RelaySchedule>) {
    const r = (this.relays.get(deviceUuid) ?? []).find((x) => x.id === relayId);
    const s = r?.schedules.find((x) => x.id === scheduleId);
    if (!s) throw new WorkerHttpError(404, 'Schedule not found', 'SCHEDULE_NOT_FOUND');
    Object.assign(s, patch);
  }

  async deleteSchedule(deviceUuid: string, relayId: string, scheduleId: string) {
    const r = (this.relays.get(deviceUuid) ?? []).find((x) => x.id === relayId);
    if (r) r.schedules = r.schedules.filter((x) => x.id !== scheduleId);
  }

  async listFirmwareReleases() { return this.releases; }
  async registerFirmwareRelease(input: { version: string; tagName?: string; githubRepo?: string | null; binaryUrl: string; checksumSha256?: string | null; releaseNotes?: string; fileSizeBytes?: number | null }) {
    const cleanVer = input.version.replace(/^v/i, '');
    const rel: FirmwareReleaseInfo = {
      id: crypto.randomUUID(),
      version: cleanVer,
      tagName: input.tagName ?? `v${cleanVer}`,
      githubRepo: input.githubRepo ?? 'owner/smart-energy-monitor-firmware',
      binaryUrl: input.binaryUrl,
      checksumSha256: input.checksumSha256 ?? null,
      releaseNotes: input.releaseNotes ?? '',
      fileSizeBytes: input.fileSizeBytes ?? null,
      releasedAt: new Date().toISOString(),
    };
    this.releases = [rel, ...this.releases.filter((r) => r.version !== cleanVer)];
    return rel;
  }

  async getDeviceFirmwareStatus(_uuid: string, currentVersion: string) {
    const latest = this.releases[0] ?? null;
    const updateAvailable = Boolean(latest?.binaryUrl && compareSemver(latest.version, currentVersion) > 0);
    return {
      currentVersion,
      githubRepo: latest?.githubRepo ?? 'owner/smart-energy-monitor-firmware',
      latestRelease: latest ? { ...latest, isUpdateAvailable: updateAvailable } : null,
      updateAvailable,
      jobs: this.otaJobs,
    };
  }

  async createOtaJob(input: { deviceUuid: string; deviceCode: string; userId: string; targetVersion?: string; binaryUrl?: string }) {
    const rel = this.releases[0];
    const url = input.binaryUrl ?? rel?.binaryUrl;
    if (!url) throw new WorkerHttpError(404, 'No release binary available', 'NO_FIRMWARE_RELEASE');
    const job: FirmwareOtaJob = {
      id: crypto.randomUUID(),
      deviceId: input.deviceCode,
      targetVersion: input.targetVersion ?? rel?.version ?? '1.3.0',
      binaryUrl: url,
      status: 'queued',
      progressPct: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.otaJobs.unshift(job);
    return job;
  }

  async getActiveTariff() { return this.tariffs.find((t) => t.status === 'active') ?? this.tariffs[0]; }
  async getAllTariffs() { return this.tariffs; }
  async createTariff(_adminId: string, input: Omit<TariffVersion, 'id' | 'status'>) {
    const t: TariffVersion = { ...input, id: crypto.randomUUID(), status: 'active' };
    this.tariffs.unshift(t);
    return t;
  }
  async updateTariffStatus(tariffId: string, patch: Partial<TariffVersion>) {
    const t = this.tariffs.find((x) => x.id === tariffId);
    if (!t) throw new WorkerHttpError(404, 'Tariff not found', 'NOT_FOUND');
    Object.assign(t, patch);
    return t;
  }

  async getBillingHistory(userId: string) {
    return {
      cycles: this.billingCycles.filter((c) => this.billingUserMap.get(c.id) === userId),
      manualReadings: this.manualReadings.filter((m) => this.manualUserMap.get(m.id) === userId),
    };
  }

  async getBillingById(userId: string, cycleId: string) {
    const c = this.billingCycles.find((x) => x.id === cycleId && this.billingUserMap.get(x.id) === userId);
    if (!c) throw new WorkerHttpError(404, 'Billing cycle not found', 'NOT_FOUND');
    return c;
  }

  async persistBillCalculation(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: 'automatic_esp32' | 'manual_eb_meter';
    consumerEligible: boolean;
    fixedChargesInr?: number;
    additionalChargesInr?: number;
  }) {
    const tariff = await this.getActiveTariff();
    const calculation = calculateTnebBill({
      deviceId: input.deviceCode,
      serviceCategory: 'LT-IA',
      consumerEligible: input.consumerEligible,
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      previousReadingDate: input.previousReadingDate,
      currentReadingDate: input.currentReadingDate,
      readingSource: input.readingSource,
      tariffVersion: tariff,
      fixedChargesInr: input.fixedChargesInr,
      additionalChargesInr: input.additionalChargesInr,
    });
    const cyc: BillingCycleRecord = {
      id: crypto.randomUUID(),
      deviceId: input.deviceCode,
      userId: input.userId,
      periodStart: input.previousReadingDate,
      periodEnd: input.currentReadingDate,
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      unitsConsumed: calculation.unitsConsumed,
      readingSource: input.readingSource,
      estimatedAmountInr: calculation.totalEstimatedAmountInr,
      actualBillAmountInr: null,
      varianceAmountInr: null,
      tariffVersionCode: tariff.versionCode,
      status: 'estimated',
      calculationPayload: calculation,
      createdAt: new Date().toISOString(),
    };
    this.billingCycles.unshift(cyc);
    this.billingUserMap.set(cyc.id, input.userId);
    return { cycle: cyc, calculation };
  }

  async submitManualReading(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    consumerEligible: boolean;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    notes?: string;
    preferredSource?: 'automatic_esp32' | 'manual_eb_meter';
  }) {
    const ctr = await this.getEnergyCounter(input.deviceUuid);
    const units = input.currentReading - input.previousReading;
    const man: ManualReadingRecord = {
      id: crypto.randomUUID(),
      deviceId: input.deviceCode,
      userId: input.userId,
      previousReading: input.previousReading,
      previousReadingDate: input.previousReadingDate,
      currentReading: input.currentReading,
      currentReadingDate: input.currentReadingDate,
      unitsConsumed: units,
      meterSerialNumber: input.meterSerialNumber ?? null,
      notes: input.notes ?? null,
      automaticComparisonKwh: ctr.lifetimeKwh,
      discrepancyKwh: Number((units - ctr.lifetimeKwh).toFixed(4)),
      discrepancyPercent: 0,
      selectedForEstimate: input.preferredSource !== 'automatic_esp32',
      createdAt: new Date().toISOString(),
    };
    this.manualReadings.unshift(man);
    this.manualUserMap.set(man.id, input.userId);
    const billRes = await this.persistBillCalculation({ ...input, readingSource: input.preferredSource ?? 'manual_eb_meter' });
    return { manualReading: man, ...billRes };
  }

  async recordActualBill(userId: string, cycleId: string, actualAmountInr: number) {
    const c = await this.getBillingById(userId, cycleId);
    c.actualBillAmountInr = actualAmountInr;
    c.varianceAmountInr = Number((actualAmountInr - c.estimatedAmountInr).toFixed(2));
    c.status = 'billed';
    return c;
  }

  async evaluateAlerts(point: TelemetryPoint, deviceUuid: string, ownerUserId: string) {
    const rules = this.alertRules.filter((r) => r.deviceUuid === deviceUuid && r.enabled);
    const out: AlertEvent[] = [];
    for (const r of rules) {
      let obs: number | null = null;
      if (r.alertType === 'high_power') obs = point.activePowerW;
      else if (r.alertType === 'high_current' || r.alertType === 'overcurrent_warning') obs = point.currentRms;
      else if (r.alertType === 'abnormal_voltage') obs = point.voltageRms;
      else if (r.alertType === 'low_power_factor') obs = point.powerFactor;
      if (obs === null) continue;
      if ((r.comparisonOperator === 'gt' && obs > r.thresholdValue) || (r.comparisonOperator === 'lt' && obs < r.thresholdValue)) {
        const ev: AlertEvent & { deviceUuid: string } = {
          id: crypto.randomUUID(),
          deviceUuid,
          deviceId: point.deviceId,
          userId: ownerUserId,
          alertType: r.alertType,
          thresholdValue: r.thresholdValue,
          observedValue: obs,
          severity: r.severity,
          status: 'active',
          message: `Advisory alert (${r.alertType}): ${obs}`,
          createdAt: new Date().toISOString(),
        };
        this.alerts.unshift(ev);
        out.push(ev);
      }
    }
    return out;
  }

  async createDeviceAlert(deviceCode: string, alertType: AlertEvent['alertType'], observed: number, message: string, severity: AlertEvent['severity'] = 'warning') {
    const dev = Array.from(this.devices.values()).find((d) => d.deviceId === deviceCode.toUpperCase());
    if (!dev) return;
    this.alerts.unshift({
      id: crypto.randomUUID(),
      deviceUuid: dev.uuid,
      deviceId: dev.deviceId,
      userId: dev.ownerUserId,
      alertType,
      thresholdValue: 0,
      observedValue: observed,
      severity,
      status: 'active',
      message,
      createdAt: new Date().toISOString(),
    });
  }

  async listAlerts(userId: string, role: UserRole) {
    return {
      alerts: this.alerts.filter((a) => role === 'admin' || a.userId === userId),
      rules: this.alertRules.filter((r) => role === 'admin' || r.userId === userId),
    };
  }

  async acknowledgeAlert(alertId: string, userId: string, role: UserRole) {
    const a = this.alerts.find((x) => x.id === alertId && (role === 'admin' || x.userId === userId));
    if (a) a.status = 'acknowledged';
  }

  async createAlertRule(userId: string, deviceUuid: string, deviceCode: string, rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>) {
    const created = { ...rule, deviceUuid, id: crypto.randomUUID(), deviceId: deviceCode, userId, createdAt: new Date().toISOString() };
    this.alertRules.unshift(created);
    return created;
  }

  async updateAlertRule(ruleId: string, userId: string, role: UserRole, patch: Partial<AlertRule>) {
    const r = this.alertRules.find((x) => x.id === ruleId && (role === 'admin' || x.userId === userId));
    if (!r) throw new WorkerHttpError(404, 'Rule not found', 'NOT_FOUND');
    Object.assign(r, patch);
    return r;
  }

  async listAllUsers() {
    return this.users.map(({ passwordHash: _p, ...u }) => u);
  }

  async assignDeviceOwnership(deviceCodeOrUuid: string, newOwnerId: string) {
    const d = await this.resolveAuthorizedDevice(deviceCodeOrUuid, newOwnerId, 'admin');
    d.ownerUserId = newOwnerId;
    return toPublicDevice(d);
  }

  async getPlatformStats() {
    let totalRows = 0;
    for (const pts of this.telemetry.values()) totalRows += pts.length;
    return {
      users: this.users.length,
      devices: this.devices.size,
      telemetryRows: totalRows,
      activeAlerts: this.alerts.filter((a) => a.status === 'active').length,
    };
  }
}
