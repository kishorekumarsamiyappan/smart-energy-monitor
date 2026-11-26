import {
  formatKolkataDate,
  summarizeTelemetry,
  TelemetryPoint,
  TelemetrySummaryStats,
  validateTelemetryValues,
} from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

export interface IngestTelemetryInput {
  deviceId: string;
  voltageRms: number;
  currentRms: number;
  activePowerW: number;
  apparentPowerVa: number;
  powerFactor: number;
  frequencyHz: number;
  energyKwh: number;
  deviceTimestamp: string;
  wifiRssiDbm?: number;
  seq?: number;
  buffered?: boolean;
}

export interface IngestResult {
  accepted: boolean;
  duplicate: boolean;
  counterResetDetected: boolean;
  effectiveLifetimeKwh: number;
  point: TelemetryPoint | null;
}

export class TelemetryService {
  constructor(private readonly db: DatabaseClient) {}

  async ingest(input: IngestTelemetryInput): Promise<IngestResult> {
    const devRes = await this.db.query<{ id: string; owner_user_id: string; device_id: string }>(
      `SELECT id, owner_user_id, device_id FROM devices WHERE UPPER(device_id) = UPPER($1) LIMIT 1`,
      [input.deviceId],
    );
    const dev = devRes.rows[0];
    if (!dev) {
      throw new AppError(404, `Unknown device ${input.deviceId}`, 'UNKNOWN_DEVICE');
    }

    const validation = validateTelemetryValues({
      voltageRms: input.voltageRms,
      currentRms: input.currentRms,
      activePowerW: input.activePowerW,
      apparentPowerVa: input.apparentPowerVa,
      powerFactor: input.powerFactor,
      frequencyHz: input.frequencyHz,
      energyKwh: input.energyKwh,
    });
    if (!validation.valid) {
      throw new AppError(400, `Invalid telemetry payload: ${validation.reasons.join('; ')}`, 'INVALID_TELEMETRY');
    }

    // Duplicate message protection via unique constraint (device_uuid, device_timestamp)
    const dupCheck = await this.db.query<{ id: string }>(
      `SELECT id FROM telemetry WHERE device_uuid = $1 AND device_timestamp = $2::timestamptz LIMIT 1`,
      [dev.id, input.deviceTimestamp],
    );
    if (dupCheck.rows.length > 0) {
      return {
        accepted: false,
        duplicate: true,
        counterResetDetected: false,
        effectiveLifetimeKwh: input.energyKwh,
        point: null,
      };
    }

    // Check if an offline-buffered sample is backfilling earlier than the latest known reading
    const latestTsRes = await this.db.query<{ max_ts: string | null }>(
      `SELECT MAX(device_timestamp)::text AS max_ts FROM telemetry WHERE device_uuid = $1`,
      [dev.id],
    );
    const latestTsMs = latestTsRes.rows[0]?.max_ts ? new Date(latestTsRes.rows[0].max_ts).getTime() : 0;
    const isHistoricalBackfill = Boolean(input.buffered) && latestTsMs > 0 && new Date(input.deviceTimestamp).getTime() < latestTsMs;

    // Lifetime counter continuity & rollover/reset detection (skip reset detection on out-of-order backfill)
    const ctrRes = await this.db.query<{
      lifetime_kwh: string;
      last_reported_device_kwh: string;
      reset_offset_kwh: string;
      counter_reset_count: number;
    }>(`SELECT * FROM energy_counters WHERE device_uuid = $1 LIMIT 1`, [dev.id]);

    const ctr = ctrRes.rows[0];
    const prevReported = ctr ? Number(ctr.last_reported_device_kwh) : 0;
    const prevOffset = ctr ? Number(ctr.reset_offset_kwh) : 0;
    let resetDetected = false;
    let nextOffset = prevOffset;
    let resetCount = ctr ? ctr.counter_reset_count : 0;

    if (!isHistoricalBackfill && ctr && input.energyKwh + 0.005 < prevReported) {
      // Device counter dropped (e.g., NVS erased or device replaced) -> preserve lifetime continuity!
      resetDetected = true;
      nextOffset = Number(ctr.lifetime_kwh);
      resetCount += 1;
    }
    const effectiveLifetimeKwh = Math.round((nextOffset + input.energyKwh) * 10000) / 10000;

    const ingestedNow = new Date().toISOString();

    let insertRes: { rows: Array<{ id: string; ingested_at: string; device_timestamp: string }> };
    try {
      insertRes = await this.db.query<{
        id: string;
        ingested_at: string;
        device_timestamp: string;
      }>(
        `INSERT INTO telemetry (
          device_uuid, device_id, voltage_rms, current_rms, active_power_w,
          apparent_power_va, power_factor, frequency_hz, energy_kwh,
          wifi_rssi_dbm, message_seq, device_timestamp, ingested_at, is_valid, is_buffered
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz, TRUE, $14)
        RETURNING id, ingested_at, device_timestamp`,
        [
          dev.id,
          dev.device_id,
          input.voltageRms,
          input.currentRms,
          input.activePowerW,
          input.apparentPowerVa,
          input.powerFactor,
          input.frequencyHz,
          effectiveLifetimeKwh,
          input.wifiRssiDbm ?? null,
          input.seq ?? null,
          input.deviceTimestamp,
          ingestedNow,
          Boolean(input.buffered),
        ],
      );
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return {
          accepted: false,
          duplicate: true,
          counterResetDetected: false,
          effectiveLifetimeKwh: input.energyKwh,
          point: null,
        };
      }
      throw err;
    }

    if (!isHistoricalBackfill) {
      await this.db.query(
        `INSERT INTO energy_counters (
          device_uuid, lifetime_kwh, last_reported_device_kwh, reset_offset_kwh,
          counter_reset_count, last_reset_detected_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, NOW())
        ON CONFLICT (device_uuid) DO UPDATE SET
          lifetime_kwh = EXCLUDED.lifetime_kwh,
          last_reported_device_kwh = EXCLUDED.last_reported_device_kwh,
          reset_offset_kwh = EXCLUDED.reset_offset_kwh,
          counter_reset_count = EXCLUDED.counter_reset_count,
          last_reset_detected_at = COALESCE(EXCLUDED.last_reset_detected_at, energy_counters.last_reset_detected_at),
          updated_at = NOW()`,
        [
          dev.id,
          effectiveLifetimeKwh,
          input.energyKwh,
          nextOffset,
          resetCount,
          resetDetected ? ingestedNow : null,
        ],
      );

      await this.db.query(
        `INSERT INTO device_status (device_uuid, is_online, wifi_rssi_dbm, last_seen_at, updated_at)
         VALUES ($1, TRUE, $2, $3::timestamptz, NOW())
         ON CONFLICT (device_uuid) DO UPDATE SET
           is_online = TRUE,
           wifi_rssi_dbm = COALESCE(EXCLUDED.wifi_rssi_dbm, device_status.wifi_rssi_dbm),
           last_seen_at = EXCLUDED.last_seen_at,
           updated_at = NOW()`,
        [dev.id, input.wifiRssiDbm ?? null, ingestedNow],
      );
    }

    // Upsert Asia/Kolkata daily rollup using the measurement's actual deviceTimestamp
    const dayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(input.deviceTimestamp));

    await this.db.query(
      `INSERT INTO energy_daily (
        device_uuid, day_ist, start_kwh, end_kwh, consumed_kwh,
        min_voltage_v, max_voltage_v, avg_voltage_v, peak_power_w, avg_power_w, avg_power_factor, sample_count
      ) VALUES ($1, $2::date, $3, $3, 0, $4, $4, $4, $5, $5, $6, 1)
      ON CONFLICT (device_uuid, day_ist) DO UPDATE SET
        end_kwh = EXCLUDED.end_kwh,
        consumed_kwh = GREATEST(0, EXCLUDED.end_kwh - energy_daily.start_kwh),
        min_voltage_v = LEAST(COALESCE(energy_daily.min_voltage_v, EXCLUDED.min_voltage_v), EXCLUDED.min_voltage_v),
        max_voltage_v = GREATEST(COALESCE(energy_daily.max_voltage_v, EXCLUDED.max_voltage_v), EXCLUDED.max_voltage_v),
        avg_voltage_v = ((COALESCE(energy_daily.avg_voltage_v, 0) * energy_daily.sample_count) + EXCLUDED.avg_voltage_v) / (energy_daily.sample_count + 1),
        peak_power_w = GREATEST(COALESCE(energy_daily.peak_power_w, EXCLUDED.peak_power_w), EXCLUDED.peak_power_w),
        avg_power_w = ((COALESCE(energy_daily.avg_power_w, 0) * energy_daily.sample_count) + EXCLUDED.avg_power_w) / (energy_daily.sample_count + 1),
        avg_power_factor = ((COALESCE(energy_daily.avg_power_factor, 0) * energy_daily.sample_count) + EXCLUDED.avg_power_factor) / (energy_daily.sample_count + 1),
        sample_count = energy_daily.sample_count + 1,
        updated_at = NOW()`,
      [
        dev.id,
        dayIst,
        effectiveLifetimeKwh,
        input.voltageRms,
        input.activePowerW,
        input.powerFactor,
      ],
    );

    const row = insertRes.rows[0];
    return {
      accepted: true,
      duplicate: false,
      counterResetDetected: resetDetected,
      effectiveLifetimeKwh,
      point: {
        id: String(row.id),
        deviceId: dev.device_id,
        voltageRms: input.voltageRms,
        currentRms: input.currentRms,
        activePowerW: input.activePowerW,
        apparentPowerVa: input.apparentPowerVa,
        powerFactor: input.powerFactor,
        frequencyHz: input.frequencyHz,
        energyKwh: effectiveLifetimeKwh,
        deviceTimestamp: new Date(row.device_timestamp).toISOString(),
        ingestedAt: new Date(row.ingested_at).toISOString(),
        wifiRssiDbm: input.wifiRssiDbm ?? null,
        isValid: true,
        isDemo: false,
      },
    };
  }

  async markDeviceOffline(deviceId: string, reason = 'MQTT_LWT'): Promise<void> {
    await this.db.query(
      `UPDATE device_status ds
       SET is_online = FALSE, last_lwt_at = NOW(), last_reset_reason = $2, updated_at = NOW()
       FROM devices d
       WHERE ds.device_uuid = d.id AND UPPER(d.device_id) = UPPER($1)`,
      [deviceId, reason],
    );
  }

  async getLatest(deviceUuid: string): Promise<TelemetryPoint | null> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM telemetry WHERE device_uuid = $1 ORDER BY ingested_at DESC LIMIT 1`,
      [deviceUuid],
    );
    const r = res.rows[0];
    if (!r) return null;
    return this.mapRow(r);
  }

  async getHistory(
    deviceUuid: string,
    options: { days?: number; startDate?: string; endDate?: string; limit?: number } = {},
  ): Promise<{ points: TelemetryPoint[]; summary: TelemetrySummaryStats }> {
    const days = Math.min(365, Math.max(1, options.days ?? 1));
    const limit = Math.min(5000, Math.max(10, options.limit ?? 1500));

    let sql = `SELECT * FROM telemetry WHERE device_uuid = $1`;
    const params: unknown[] = [deviceUuid];

    if (options.startDate && options.endDate) {
      params.push(`${options.startDate}T00:00:00+05:30`, `${options.endDate}T23:59:59+05:30`);
      sql += ` AND device_timestamp BETWEEN $2::timestamptz AND $3::timestamptz`;
    } else {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      params.push(since);
      sql += ` AND device_timestamp >= $2::timestamptz`;
    }

    sql += ` ORDER BY device_timestamp ASC LIMIT ${limit}`;
    const res = await this.db.query<Record<string, unknown>>(sql, params);
    const points = res.rows.map((r) => this.mapRow(r));
    return {
      points,
      summary: summarizeTelemetry(points),
    };
  }

  async getDailyRollups(deviceUuid: string, days: number = 30) {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT day_ist, start_kwh, end_kwh, consumed_kwh, min_voltage_v, max_voltage_v,
              avg_voltage_v, peak_power_w, avg_power_w, avg_power_factor, sample_count
       FROM energy_daily
       WHERE device_uuid = $1
       ORDER BY day_ist DESC
       LIMIT $2`,
      [deviceUuid, days],
    );
    return res.rows.map((r) => ({
      dayIst: formatKolkataDate(String(r.day_ist)),
      isoDate: String(r.day_ist).slice(0, 10),
      startKwh: Number(r.start_kwh),
      endKwh: Number(r.end_kwh),
      consumedKwh: Number(r.consumed_kwh),
      minVoltageV: Number(r.min_voltage_v ?? 0),
      maxVoltageV: Number(r.max_voltage_v ?? 0),
      avgVoltageV: Number(r.avg_voltage_v ?? 0),
      peakPowerW: Number(r.peak_power_w ?? 0),
      avgPowerW: Number(r.avg_power_w ?? 0),
      avgPowerFactor: Number(r.avg_power_factor ?? 0),
      sampleCount: Number(r.sample_count ?? 0),
    }));
  }

  async getMonthlyRollups(deviceUuid: string) {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT TO_CHAR(day_ist, 'YYYY-MM') AS month_ist,
              SUM(consumed_kwh)::numeric(14,4) AS total_kwh,
              MAX(peak_power_w)::numeric(10,3) AS peak_power_w,
              AVG(avg_voltage_v)::numeric(8,2) AS avg_voltage_v,
              SUM(sample_count)::int AS samples
       FROM energy_daily
       WHERE device_uuid = $1
       GROUP BY TO_CHAR(day_ist, 'YYYY-MM')
       ORDER BY month_ist DESC
       LIMIT 24`,
      [deviceUuid],
    );
    return res.rows.map((r) => ({
      monthIst: String(r.month_ist),
      totalKwh: Number(r.total_kwh ?? 0),
      peakPowerW: Number(r.peak_power_w ?? 0),
      avgVoltageV: Number(r.avg_voltage_v ?? 0),
      samples: Number(r.samples ?? 0),
    }));
  }

  async getEnergyCounter(deviceUuid: string) {
    const res = await this.db.query<{
      lifetime_kwh: string;
      reset_offset_kwh: string;
      counter_reset_count: number;
      updated_at: string;
    }>(`SELECT * FROM energy_counters WHERE device_uuid = $1 LIMIT 1`, [deviceUuid]);
    const r = res.rows[0];
    return {
      lifetimeKwh: r ? Number(r.lifetime_kwh) : 0,
      resetOffsetKwh: r ? Number(r.reset_offset_kwh) : 0,
      counterResetCount: r ? r.counter_reset_count : 0,
      updatedAt: r ? new Date(r.updated_at).toISOString() : null,
    };
  }

  private mapRow(r: Record<string, unknown>): TelemetryPoint {
    return {
      id: String(r.id),
      deviceId: String(r.device_id),
      voltageRms: Number(r.voltage_rms),
      currentRms: Number(r.current_rms),
      activePowerW: Number(r.active_power_w),
      apparentPowerVa: Number(r.apparent_power_va),
      powerFactor: Number(r.power_factor),
      frequencyHz: Number(r.frequency_hz),
      energyKwh: Number(r.energy_kwh),
      deviceTimestamp: new Date(String(r.device_timestamp)).toISOString(),
      ingestedAt: new Date(String(r.ingested_at)).toISOString(),
      wifiRssiDbm: r.wifi_rssi_dbm == null ? null : Number(r.wifi_rssi_dbm),
      isValid: Boolean(r.is_valid),
      isDemo: false,
    };
  }
}
