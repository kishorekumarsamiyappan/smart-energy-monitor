import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Device, DeviceIoConfig, DeviceSensorConfig, StatusLedMode, UserRole } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

interface DeviceRow {
  id: string;
  device_id: string;
  owner_user_id: string;
  name: string;
  location_label: string | null;
  service_category: string;
  consumer_eligible_for_subsidy: boolean;
  meter_serial_number: string | null;
  firmware_version: string;
  hardware_version: string;
  telemetry_interval_sec: number;
  monitoring_mode: 'automatic' | 'manual_preferred';
  shared_user_ids: string[];
  created_at: string;
  updated_at: string;
  is_online?: boolean;
  wifi_rssi_dbm?: number | null;
  last_seen_at?: string | null;
}

function mapDevice(row: DeviceRow): Device {
  return {
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
    isDemo: false,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class DeviceService {
  constructor(private readonly db: DatabaseClient) {}

  async resolveAuthorizedDevice(
    deviceCodeOrUuid: string,
    userId: string,
    role: UserRole,
  ): Promise<DeviceRow> {
    const clean = deviceCodeOrUuid.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean);
    const res = await this.db.query<DeviceRow>(
      `SELECT d.*, ds.is_online, ds.wifi_rssi_dbm, ds.last_seen_at
       FROM devices d
       LEFT JOIN device_status ds ON ds.device_uuid = d.id
       WHERE ${isUuid ? 'd.id = $1' : 'UPPER(d.device_id) = UPPER($1)'}
       LIMIT 1`,
      [clean],
    );
    const row = res.rows[0];
    if (!row) {
      throw new AppError(404, `Device ${clean} not found.`, 'DEVICE_NOT_FOUND');
    }
    const isOwner =
      row.owner_user_id === userId || (row.shared_user_ids || []).includes(userId);
    if (!isOwner && role !== 'admin') {
      throw new AppError(403, 'You do not have permission to access this device.', 'FORBIDDEN');
    }
    return row;
  }

  async listDevices(userId: string, role: UserRole): Promise<Device[]> {
    const whereClause =
      role === 'admin'
        ? ''
        : `WHERE d.owner_user_id = $1 OR $1 = ANY(d.shared_user_ids)`;
    const res = await this.db.query<DeviceRow>(
      `SELECT d.*, ds.is_online, ds.wifi_rssi_dbm, ds.last_seen_at
       FROM devices d
       LEFT JOIN device_status ds ON ds.device_uuid = d.id
       ${whereClause}
       ORDER BY d.created_at DESC`,
      role === 'admin' ? [] : [userId],
    );
    return res.rows.map(mapDevice);
  }

  async createDevice(
    userId: string,
    input: {
      deviceId: string;
      name: string;
      locationLabel?: string;
      serviceCategory?: string;
      consumerEligibleForSubsidy?: boolean;
      meterSerialNumber?: string;
    },
  ): Promise<{ device: Device; mqttProvisioning: { username: string; oneTimeSecret: string } }> {
    const code = input.deviceId.trim().toUpperCase();
    const exists = await this.db.query<{ id: string }>(
      `SELECT id FROM devices WHERE UPPER(device_id) = $1 LIMIT 1`,
      [code],
    );
    if (exists.rows.length > 0) {
      throw new AppError(409, `Device ID ${code} is already registered.`, 'DUPLICATE_DEVICE');
    }

    const res = await this.db.query<DeviceRow>(
      `INSERT INTO devices (
        device_id, owner_user_id, name, location_label, service_category,
        consumer_eligible_for_subsidy, meter_serial_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        code,
        userId,
        input.name.trim(),
        input.locationLabel?.trim() || null,
        input.serviceCategory || 'LT-IA',
        input.consumerEligibleForSubsidy ?? true,
        input.meterSerialNumber?.trim() || null,
      ],
    );
    const created = res.rows[0];

    const mqttUsername = `dev_${code.toLowerCase()}`;
    const oneTimeSecret = crypto.randomBytes(18).toString('base64url');
    const mqttSecretHash = await bcrypt.hash(oneTimeSecret, 10);

    await this.db.query(
      `INSERT INTO device_credentials (device_uuid, mqtt_username, mqtt_password_hash) VALUES ($1, $2, $3)`,
      [created.id, mqttUsername, mqttSecretHash],
    );
    await this.db.query(
      `INSERT INTO device_status (device_uuid, is_online) VALUES ($1, FALSE)`,
      [created.id],
    );
    await this.db.query(
      `INSERT INTO energy_counters (device_uuid, lifetime_kwh, last_reported_device_kwh) VALUES ($1, 0, 0)`,
      [created.id],
    );
    await this.db.query(
      `INSERT INTO calibration_records (device_uuid, calibrated_by_user_id, notes)
       VALUES ($1, $2, 'Initial factory baseline on pairing')`,
      [created.id, userId],
    );
    await this.db.query(
      `INSERT INTO device_io_configs (device_uuid) VALUES ($1) ON CONFLICT (device_uuid) DO NOTHING`,
      [created.id],
    );
    await this.db.query(
      `INSERT INTO device_relays (device_uuid, channel_index, name, gpio_pin, active_high, current_state, fail_safe_state, is_confirmed_default)
       VALUES ($1, 1, 'Confirmed Relay 1', 4, TRUE, FALSE, FALSE, TRUE)
       ON CONFLICT (device_uuid, channel_index) DO NOTHING`,
      [created.id],
    );
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'DEVICE_PAIRED', 'devices', $2, $3::jsonb)`,
      [userId, created.id, JSON.stringify({ deviceId: code })],
    );

    return {
      device: mapDevice(created),
      mqttProvisioning: {
        username: mqttUsername,
        oneTimeSecret,
      },
    };
  }

  async getSensorConfig(deviceUuid: string, deviceCode: string): Promise<DeviceSensorConfig> {
    const calRes = await this.db.query<{
      voltage_sensor_model: string;
      current_sensor_model: string;
      adc_model: string;
      voltage_cal_factor: string;
      current_cal_factor: string;
      phase_correction_deg: string;
      nominal_frequency_hz: string;
      calibration_status: DeviceSensorConfig['calibrationStatus'];
      calibrated_at: string;
    }>(
      `SELECT * FROM calibration_records WHERE device_uuid = $1 ORDER BY calibrated_at DESC LIMIT 1`,
      [deviceUuid],
    );
    const statusRes = await this.db.query<{
      adc_spi_ok: boolean;
      drdy_status_ok: boolean;
      sensor_health_status: DeviceSensorConfig['sensorHealthStatus'];
    }>(`SELECT adc_spi_ok, drdy_status_ok, sensor_health_status FROM device_status WHERE device_uuid = $1 LIMIT 1`, [
      deviceUuid,
    ]);

    const cal = calRes.rows[0];
    const st = statusRes.rows[0];
    return {
      deviceId: deviceCode,
      voltageSensorModel: cal?.voltage_sensor_model ?? 'ZMPT101B',
      currentSensorModel: cal?.current_sensor_model ?? 'SCT-013 (30A / 1V built-in burden)',
      adcModel: cal?.adc_model ?? 'ADS131M02',
      voltageCalibrationFactor: cal ? Number(cal.voltage_cal_factor) : 1.0,
      currentCalibrationFactor: cal ? Number(cal.current_cal_factor) : 1.0,
      phaseCorrectionDeg: cal ? Number(cal.phase_correction_deg) : 0.0,
      nominalFrequencyHz: cal ? Number(cal.nominal_frequency_hz) : 50.0,
      calibrationDate: cal?.calibrated_at ? new Date(cal.calibrated_at).toISOString().slice(0, 10) : null,
      calibrationStatus: cal?.calibration_status ?? 'factory_default',
      adcSpiOk: st?.adc_spi_ok ?? true,
      drdyStatusOk: st?.drdy_status_ok ?? true,
      sensorHealthStatus: st?.sensor_health_status ?? 'good',
    };
  }

  async updateDevice(
    deviceCodeOrUuid: string,
    userId: string,
    role: UserRole,
    patch: {
      name?: string;
      locationLabel?: string | null;
      consumerEligibleForSubsidy?: boolean;
      telemetryIntervalSec?: number;
      monitoringMode?: 'automatic' | 'manual_preferred';
      meterSerialNumber?: string | null;
      sensorConfig?: {
        voltageCalibrationFactor?: number;
        currentCalibrationFactor?: number;
        phaseCorrectionDeg?: number;
        calibrationStatus?: 'verified' | 'pending' | 'factory_default' | 'recalibration_due';
      };
    },
  ): Promise<Device> {
    const dev = await this.resolveAuthorizedDevice(deviceCodeOrUuid, userId, role);

    if (patch.sensorConfig) {
      if (role !== 'admin') {
        throw new AppError(
          403,
          'Only administrators may modify raw electrical calibration constants.',
          'CALIBRATION_ADMIN_ONLY',
        );
      }
      await this.db.query(
        `INSERT INTO calibration_records (
          device_uuid, voltage_cal_factor, current_cal_factor, phase_correction_deg,
          calibration_status, calibrated_by_user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Admin recalibration update')`,
        [
          dev.id,
          patch.sensorConfig.voltageCalibrationFactor ?? 1.0,
          patch.sensorConfig.currentCalibrationFactor ?? 1.0,
          patch.sensorConfig.phaseCorrectionDeg ?? 0.0,
          patch.sensorConfig.calibrationStatus ?? 'verified',
          userId,
        ],
      );
    }

    const updated = await this.db.query<DeviceRow>(
      `UPDATE devices
       SET name = COALESCE($2, name),
           location_label = COALESCE($3, location_label),
           consumer_eligible_for_subsidy = COALESCE($4, consumer_eligible_for_subsidy),
           telemetry_interval_sec = COALESCE($5, telemetry_interval_sec),
           monitoring_mode = COALESCE($6, monitoring_mode),
           meter_serial_number = COALESCE($7, meter_serial_number)
       WHERE id = $1
       RETURNING *`,
      [
        dev.id,
        patch.name?.trim() ?? null,
        patch.locationLabel === undefined ? null : patch.locationLabel,
        patch.consumerEligibleForSubsidy ?? null,
        patch.telemetryIntervalSec ?? null,
        patch.monitoringMode ?? null,
        patch.meterSerialNumber === undefined ? null : patch.meterSerialNumber,
      ],
    );
    const full = await this.resolveAuthorizedDevice(updated.rows[0].id, userId, role);
    return mapDevice(full);
  }

  async deleteDevice(deviceCodeOrUuid: string, userId: string, role: UserRole): Promise<void> {
    const dev = await this.resolveAuthorizedDevice(deviceCodeOrUuid, userId, role);
    if (dev.owner_user_id !== userId && role !== 'admin') {
      throw new AppError(403, 'Only the primary device owner or admin can remove a device.', 'FORBIDDEN');
    }
    await this.db.query(`DELETE FROM devices WHERE id = $1`, [dev.id]);
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values)
       VALUES ($1, 'DEVICE_REMOVED', 'devices', $2, $3::jsonb)`,
      [userId, dev.id, JSON.stringify({ deviceId: dev.device_id })],
    );
  }

  async assignOwnership(
    adminUserId: string,
    deviceCodeOrUuid: string,
    newOwnerUserId: string,
  ): Promise<Device> {
    const dev = await this.resolveAuthorizedDevice(deviceCodeOrUuid, adminUserId, 'admin');
    const userCheck = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [
      newOwnerUserId,
    ]);
    if (!userCheck.rows[0]) {
      throw new AppError(404, 'Target owner user does not exist.', 'USER_NOT_FOUND');
    }
    await this.db.query(`UPDATE devices SET owner_user_id = $2 WHERE id = $1`, [dev.id, newOwnerUserId]);
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'DEVICE_REASSIGNED', 'devices', $2, $3::jsonb, $4::jsonb)`,
      [
        adminUserId,
        dev.id,
        JSON.stringify({ ownerUserId: dev.owner_user_id }),
        JSON.stringify({ ownerUserId: newOwnerUserId }),
      ],
    );
    const updated = await this.resolveAuthorizedDevice(dev.id, adminUserId, 'admin');
    return mapDevice(updated);
  }

  async getIoConfig(deviceUuid: string, deviceCode: string): Promise<DeviceIoConfig> {
    await this.db.query(
      `INSERT INTO device_io_configs (device_uuid) VALUES ($1) ON CONFLICT (device_uuid) DO NOTHING`,
      [deviceUuid],
    );
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM device_io_configs WHERE device_uuid = $1 LIMIT 1`,
      [deviceUuid],
    );
    const r = res.rows[0];
    return {
      deviceId: deviceCode,
      statusLedMode: (r?.status_led_mode as StatusLedMode) ?? 'inbuilt_rgb',
      statusRgbGpio: Number(r?.status_rgb_gpio ?? 48),
      statusSingleLedGpio: Number(r?.status_single_led_gpio ?? 2),
      pulseLedEnabled: r?.pulse_led_enabled !== false,
      pulseLedGpio: Number(r?.pulse_led_gpio ?? 21),
      pulseImpPerKwh: Number(r?.pulse_imp_per_kwh ?? 1600),
      offlineBufferEnabled: r?.offline_buffer_enabled !== false,
      offlineBufferedCount: Number(r?.offline_buffered_count ?? 0),
    };
  }

  async updateIoConfig(
    deviceUuid: string,
    deviceCode: string,
    patch: Partial<Omit<DeviceIoConfig, 'deviceId' | 'offlineBufferedCount'>>,
  ): Promise<DeviceIoConfig> {
    await this.getIoConfig(deviceUuid, deviceCode);
    await this.db.query(
      `UPDATE device_io_configs
       SET status_led_mode = COALESCE($2, status_led_mode),
           status_rgb_gpio = COALESCE($3, status_rgb_gpio),
           status_single_led_gpio = COALESCE($4, status_single_led_gpio),
           pulse_led_enabled = COALESCE($5, pulse_led_enabled),
           pulse_led_gpio = COALESCE($6, pulse_led_gpio),
           pulse_imp_per_kwh = COALESCE($7, pulse_imp_per_kwh),
           offline_buffer_enabled = COALESCE($8, offline_buffer_enabled)
       WHERE device_uuid = $1`,
      [
        deviceUuid,
        patch.statusLedMode ?? null,
        patch.statusRgbGpio ?? null,
        patch.statusSingleLedGpio ?? null,
        patch.pulseLedEnabled ?? null,
        patch.pulseLedGpio ?? null,
        patch.pulseImpPerKwh ?? null,
        patch.offlineBufferEnabled ?? null,
      ],
    );
    return this.getIoConfig(deviceUuid, deviceCode);
  }
}
