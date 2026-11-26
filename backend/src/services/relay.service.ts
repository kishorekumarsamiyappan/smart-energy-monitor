import { DeviceRelay, RelaySchedule, RESERVED_ESP32_GPIOS } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

export class RelayService {
  constructor(private readonly db: DatabaseClient) {}

  async ensureDefaultRelay(deviceUuid: string): Promise<void> {
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM device_relays WHERE device_uuid = $1 LIMIT 1`,
      [deviceUuid],
    );
    if (existing.rows.length > 0) return;

    await this.db.query(
      `INSERT INTO device_relays (
        device_uuid, channel_index, name, gpio_pin, active_high,
        current_state, fail_safe_state, is_confirmed_default
      ) VALUES ($1, 1, 'Confirmed Relay 1', 4, TRUE, FALSE, FALSE, TRUE)
      ON CONFLICT (device_uuid, channel_index) DO NOTHING`,
      [deviceUuid],
    );
  }

  async listRelays(deviceUuid: string, deviceCode: string): Promise<DeviceRelay[]> {
    await this.ensureDefaultRelay(deviceUuid);
    const relaysRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM device_relays WHERE device_uuid = $1 ORDER BY channel_index ASC`,
      [deviceUuid],
    );
    const schedRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM relay_schedules WHERE device_uuid = $1 ORDER BY start_time_ist ASC`,
      [deviceUuid],
    );

    const schedulesByRelay = new Map<string, RelaySchedule[]>();
    for (const s of schedRes.rows) {
      const relayId = String(s.relay_id);
      const list = schedulesByRelay.get(relayId) ?? [];
      list.push({
        id: String(s.id),
        relayId,
        deviceId: deviceCode,
        label: String(s.label),
        startTimeIst: String(s.start_time_ist),
        stopTimeIst: String(s.stop_time_ist),
        daysOfWeek: Array.isArray(s.days_of_week) ? s.days_of_week.map(Number) : [0, 1, 2, 3, 4, 5, 6],
        enabled: Boolean(s.enabled),
        timezone: 'Asia/Kolkata',
        createdAt: new Date(String(s.created_at)).toISOString(),
      });
      schedulesByRelay.set(relayId, list);
    }

    return relaysRes.rows.map((r) => ({
      id: String(r.id),
      deviceId: deviceCode,
      channelIndex: Number(r.channel_index),
      name: String(r.name),
      gpioPin: Number(r.gpio_pin),
      activeHigh: Boolean(r.active_high),
      currentState: Boolean(r.current_state),
      failSafeState: Boolean(r.fail_safe_state),
      isConfirmedDefault: Boolean(r.is_confirmed_default),
      schedules: schedulesByRelay.get(String(r.id)) ?? [],
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    }));
  }

  async addRelay(
    deviceUuid: string,
    deviceCode: string,
    input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean },
  ): Promise<DeviceRelay> {
    await this.ensureDefaultRelay(deviceUuid);

    if (RESERVED_ESP32_GPIOS.has(input.gpioPin)) {
      throw new AppError(400, `GPIO ${input.gpioPin} is reserved for ADS131M02 SPI or system flash.`, 'RESERVED_GPIO');
    }

    const current = await this.listRelays(deviceUuid, deviceCode);
    if (current.length >= 8) {
      throw new AppError(400, 'Maximum 8 relays supported per ESP32-S3 unit.', 'MAX_RELAYS');
    }
    if (current.some((r) => r.gpioPin === input.gpioPin)) {
      throw new AppError(409, `GPIO ${input.gpioPin} is already assigned to another relay.`, 'DUPLICATE_GPIO');
    }

    const nextChannel = Math.max(...current.map((r) => r.channelIndex)) + 1;
    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO device_relays (
        device_uuid, channel_index, name, gpio_pin, active_high,
        current_state, fail_safe_state, is_confirmed_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $6, FALSE)
      RETURNING *`,
      [deviceUuid, nextChannel, input.name.trim(), input.gpioPin, input.activeHigh, input.failSafeState],
    );
    const r = res.rows[0];
    return {
      id: String(r.id),
      deviceId: deviceCode,
      channelIndex: Number(r.channel_index),
      name: String(r.name),
      gpioPin: Number(r.gpio_pin),
      activeHigh: Boolean(r.active_high),
      currentState: Boolean(r.current_state),
      failSafeState: Boolean(r.fail_safe_state),
      isConfirmedDefault: Boolean(r.is_confirmed_default),
      schedules: [],
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  }

  async updateRelay(
    deviceUuid: string,
    deviceCode: string,
    relayId: string,
    patch: { name?: string; currentState?: boolean; failSafeState?: boolean; activeHigh?: boolean },
  ): Promise<DeviceRelay> {
    const res = await this.db.query<Record<string, unknown>>(
      `UPDATE device_relays
       SET name = COALESCE($3, name),
           current_state = COALESCE($4, current_state),
           fail_safe_state = COALESCE($5, fail_safe_state),
           active_high = COALESCE($6, active_high)
       WHERE id = $1 AND device_uuid = $2
       RETURNING *`,
      [
        relayId,
        deviceUuid,
        patch.name?.trim() ?? null,
        patch.currentState ?? null,
        patch.failSafeState ?? null,
        patch.activeHigh ?? null,
      ],
    );
    if (!res.rows[0]) {
      throw new AppError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    }
    const all = await this.listRelays(deviceUuid, deviceCode);
    return all.find((r) => r.id === relayId)!;
  }

  async deleteRelay(deviceUuid: string, relayId: string): Promise<void> {
    const check = await this.db.query<{ is_confirmed_default: boolean }>(
      `SELECT is_confirmed_default FROM device_relays WHERE id = $1 AND device_uuid = $2 LIMIT 1`,
      [relayId, deviceUuid],
    );
    if (!check.rows[0]) {
      throw new AppError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    }
    if (check.rows[0].is_confirmed_default) {
      throw new AppError(400, 'The primary confirmed relay (CH1) cannot be deleted.', 'CANNOT_DELETE_DEFAULT_RELAY');
    }
    await this.db.query(`DELETE FROM device_relays WHERE id = $1 AND device_uuid = $2`, [relayId, deviceUuid]);
  }

  async addSchedule(
    deviceUuid: string,
    deviceCode: string,
    relayId: string,
    input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean },
  ): Promise<RelaySchedule> {
    const check = await this.db.query<{ id: string }>(
      `SELECT id FROM device_relays WHERE id = $1 AND device_uuid = $2 LIMIT 1`,
      [relayId, deviceUuid],
    );
    if (!check.rows[0]) {
      throw new AppError(404, 'Relay not found', 'RELAY_NOT_FOUND');
    }

    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO relay_schedules (relay_id, device_uuid, label, start_time_ist, stop_time_ist, days_of_week, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [relayId, deviceUuid, input.label.trim(), input.startTimeIst, input.stopTimeIst, input.daysOfWeek, input.enabled],
    );
    const s = res.rows[0];
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
    const res = await this.db.query(
      `UPDATE relay_schedules
       SET label = COALESCE($4, label),
           start_time_ist = COALESCE($5, start_time_ist),
           stop_time_ist = COALESCE($6, stop_time_ist),
           days_of_week = COALESCE($7, days_of_week),
           enabled = COALESCE($8, enabled)
       WHERE id = $1 AND relay_id = $2 AND device_uuid = $3`,
      [
        scheduleId,
        relayId,
        deviceUuid,
        patch.label?.trim() ?? null,
        patch.startTimeIst ?? null,
        patch.stopTimeIst ?? null,
        patch.daysOfWeek ?? null,
        patch.enabled ?? null,
      ],
    );
    if (!res.rowCount) {
      throw new AppError(404, 'Relay schedule not found', 'SCHEDULE_NOT_FOUND');
    }
  }

  async deleteSchedule(deviceUuid: string, relayId: string, scheduleId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM relay_schedules WHERE id = $1 AND relay_id = $2 AND device_uuid = $3`,
      [scheduleId, relayId, deviceUuid],
    );
  }

  async syncReportedRelayStates(
    deviceCode: string,
    states: Array<{ channel: number; state: boolean }>,
  ): Promise<void> {
    const devRes = await this.db.query<{ id: string }>(
      `SELECT id FROM devices WHERE UPPER(device_id) = UPPER($1) LIMIT 1`,
      [deviceCode],
    );
    const dev = devRes.rows[0];
    if (!dev) return;

    for (const st of states) {
      await this.db.query(
        `UPDATE device_relays SET current_state = $3 WHERE device_uuid = $1 AND channel_index = $2`,
        [dev.id, st.channel, st.state],
      );
    }
  }

  buildMqttSyncPayload(relays: DeviceRelay[]) {
    return {
      relays: relays.map((r) => ({
        ch: r.channelIndex,
        gpio: r.gpioPin,
        active_high: r.activeHigh,
        state: r.currentState,
        fail_safe: r.failSafeState,
      })),
      schedules: relays.flatMap((r) =>
        r.schedules
          .filter((s) => s.enabled)
          .map((s) => ({
            ch: r.channelIndex,
            start: s.startTimeIst,
            stop: s.stopTimeIst,
            days: s.daysOfWeek,
          })),
      ),
    };
  }
}
