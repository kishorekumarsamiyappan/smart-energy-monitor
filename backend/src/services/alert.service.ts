import { AlertEvent, AlertRule, AlertSeverity, AlertType, TelemetryPoint, UserRole } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

export class AlertService {
  constructor(private readonly db: DatabaseClient) {}

  async evaluateTelemetry(point: TelemetryPoint): Promise<AlertEvent[]> {
    const devRes = await this.db.query<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM devices WHERE UPPER(device_id) = UPPER($1) LIMIT 1`,
      [point.deviceId],
    );
    const dev = devRes.rows[0];
    if (!dev) return [];

    const rulesRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM alert_rules WHERE device_uuid = $1 AND enabled = TRUE`,
      [dev.id],
    );

    const created: AlertEvent[] = [];
    for (const r of rulesRes.rows) {
      const alertType = String(r.alert_type) as AlertType;
      const threshold = Number(r.threshold_value);
      const secondary = r.secondary_threshold == null ? null : Number(r.secondary_threshold);
      const op = String(r.comparison_operator);

      let observed: number | null = null;
      if (alertType === 'high_current' || alertType === 'overcurrent_warning') observed = point.currentRms;
      else if (alertType === 'high_power' || alertType === 'unusual_consumption') observed = point.activePowerW;
      else if (alertType === 'abnormal_voltage') observed = point.voltageRms;
      else if (alertType === 'low_power_factor') observed = point.powerFactor;

      if (observed === null) continue;

      let triggered = false;
      if (op === 'gt') triggered = observed > threshold;
      else if (op === 'lt') triggered = observed < threshold;
      else if (op === 'outside_range' && secondary !== null) {
        triggered = observed < threshold || observed > secondary;
      }

      if (!triggered) continue;

      const msg = `Advisory alert (${alertType.replaceAll('_', ' ')}): observed ${observed} vs threshold ${threshold}${secondary != null ? `..${secondary}` : ''}. Not an electrical protection trip.`;
      const ins = await this.db.query<Record<string, unknown>>(
        `INSERT INTO alerts (device_uuid, user_id, alert_type, threshold_value, observed_value, severity, status, message)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
         RETURNING *`,
        [dev.id, dev.owner_user_id, alertType, threshold, observed, r.severity, msg],
      );
      created.push(this.mapAlert(ins.rows[0], point.deviceId));
    }
    return created;
  }

  async createOfflineAlert(deviceCode: string, offlineMinutes: number): Promise<void> {
    const devRes = await this.db.query<{ id: string; owner_user_id: string }>(
      `SELECT id, owner_user_id FROM devices WHERE UPPER(device_id) = UPPER($1) LIMIT 1`,
      [deviceCode],
    );
    const dev = devRes.rows[0];
    if (!dev) return;

    await this.db.query(
      `INSERT INTO alerts (device_uuid, user_id, alert_type, threshold_value, observed_value, severity, status, message)
       VALUES ($1, $2, 'device_offline', 120, $3, 'critical', 'active', $4)`,
      [
        dev.id,
        dev.owner_user_id,
        offlineMinutes * 60,
        `Device ${deviceCode} went offline (MQTT LWT / timeout).`,
      ],
    );
  }

  async listAlerts(userId: string, role: UserRole): Promise<{ alerts: AlertEvent[]; rules: AlertRule[] }> {
    const alertSql =
      role === 'admin'
        ? `SELECT a.*, d.device_id AS device_code FROM alerts a JOIN devices d ON d.id = a.device_uuid ORDER BY a.created_at DESC LIMIT 200`
        : `SELECT a.*, d.device_id AS device_code FROM alerts a JOIN devices d ON d.id = a.device_uuid WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 200`;

    const ruleSql =
      role === 'admin'
        ? `SELECT ar.*, d.device_id AS device_code FROM alert_rules ar JOIN devices d ON d.id = ar.device_uuid ORDER BY ar.created_at DESC`
        : `SELECT ar.*, d.device_id AS device_code FROM alert_rules ar JOIN devices d ON d.id = ar.device_uuid WHERE ar.user_id = $1 ORDER BY ar.created_at DESC`;

    const [aRes, rRes] = await Promise.all([
      this.db.query<Record<string, unknown>>(alertSql, role === 'admin' ? [] : [userId]),
      this.db.query<Record<string, unknown>>(ruleSql, role === 'admin' ? [] : [userId]),
    ]);

    return {
      alerts: aRes.rows.map((r) => this.mapAlert(r, String(r.device_code))),
      rules: rRes.rows.map((r) => this.mapRule(r, String(r.device_code))),
    };
  }

  async createRule(
    userId: string,
    deviceUuid: string,
    deviceCode: string,
    input: {
      alertType: AlertType;
      thresholdValue: number;
      comparisonOperator: 'gt' | 'lt' | 'outside_range';
      secondaryThreshold?: number | null;
      severity: AlertSeverity;
      enabled: boolean;
      pushEnabled: boolean;
    },
  ): Promise<AlertRule> {
    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO alert_rules (
        device_uuid, user_id, alert_type, threshold_value, comparison_operator,
        secondary_threshold, severity, enabled, push_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        deviceUuid,
        userId,
        input.alertType,
        input.thresholdValue,
        input.comparisonOperator,
        input.secondaryThreshold ?? null,
        input.severity,
        input.enabled,
        input.pushEnabled,
      ],
    );
    return this.mapRule(res.rows[0], deviceCode);
  }

  async updateRule(
    ruleId: string,
    userId: string,
    role: UserRole,
    patch: { thresholdValue?: number; enabled?: boolean; pushEnabled?: boolean; severity?: AlertSeverity },
  ): Promise<AlertRule> {
    const check = await this.db.query<{ user_id: string }>(`SELECT user_id FROM alert_rules WHERE id = $1 LIMIT 1`, [
      ruleId,
    ]);
    if (!check.rows[0]) throw new AppError(404, 'Alert rule not found', 'RULE_NOT_FOUND');
    if (check.rows[0].user_id !== userId && role !== 'admin') {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }

    const res = await this.db.query<Record<string, unknown>>(
      `UPDATE alert_rules
       SET threshold_value = COALESCE($2, threshold_value),
           enabled = COALESCE($3, enabled),
           push_enabled = COALESCE($4, push_enabled),
           severity = COALESCE($5, severity)
       WHERE id = $1
       RETURNING *, (SELECT device_id FROM devices WHERE id = alert_rules.device_uuid) AS device_code`,
      [ruleId, patch.thresholdValue ?? null, patch.enabled ?? null, patch.pushEnabled ?? null, patch.severity ?? null],
    );
    return this.mapRule(res.rows[0], String(res.rows[0].device_code));
  }

  async acknowledgeAlert(alertId: string, userId: string, role: UserRole): Promise<void> {
    const res = await this.db.query<{ user_id: string }>(`SELECT user_id FROM alerts WHERE id = $1 LIMIT 1`, [alertId]);
    if (!res.rows[0]) throw new AppError(404, 'Alert not found', 'ALERT_NOT_FOUND');
    if (res.rows[0].user_id !== userId && role !== 'admin') {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    await this.db.query(
      `UPDATE alerts SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2 WHERE id = $1`,
      [alertId, userId],
    );
  }

  private mapAlert(r: Record<string, unknown>, deviceCode: string): AlertEvent {
    return {
      id: String(r.id),
      deviceId: deviceCode,
      userId: String(r.user_id),
      alertType: String(r.alert_type) as AlertType,
      thresholdValue: Number(r.threshold_value),
      observedValue: Number(r.observed_value),
      severity: String(r.severity) as AlertSeverity,
      status: String(r.status) as AlertEvent['status'],
      message: String(r.message),
      acknowledgedAt: r.acknowledged_at ? new Date(String(r.acknowledged_at)).toISOString() : null,
      acknowledgedBy: r.acknowledged_by ? String(r.acknowledged_by) : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      isDemo: false,
    };
  }

  private mapRule(r: Record<string, unknown>, deviceCode: string): AlertRule {
    return {
      id: String(r.id),
      deviceId: deviceCode,
      userId: String(r.user_id),
      alertType: String(r.alert_type) as AlertType,
      thresholdValue: Number(r.threshold_value),
      comparisonOperator: String(r.comparison_operator) as AlertRule['comparisonOperator'],
      secondaryThreshold: r.secondary_threshold == null ? null : Number(r.secondary_threshold),
      severity: String(r.severity) as AlertSeverity,
      enabled: Boolean(r.enabled),
      pushEnabled: Boolean(r.push_enabled),
      createdAt: new Date(String(r.created_at)).toISOString(),
    };
  }
}
