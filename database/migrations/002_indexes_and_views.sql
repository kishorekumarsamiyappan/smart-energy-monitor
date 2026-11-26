-- ==============================================================================
-- 002_indexes_and_views.sql
-- Composite indexes for device ID, user ID, and UTC timestamp queries
-- plus Asia/Kolkata display helper views.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_devices_owner_user ON devices(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_ingested ON telemetry(device_uuid, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_code_ts ON telemetry(device_id, device_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_ingested_brin ON telemetry USING BRIN(ingested_at);

CREATE INDEX IF NOT EXISTS idx_energy_daily_device_day ON energy_daily(device_uuid, day_ist DESC);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_user_dev ON billing_cycles(user_id, device_uuid, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_manual_readings_user_dev ON manual_readings(user_id, device_uuid, current_reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_bill_estimates_user_dev ON bill_estimates(user_id, device_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status_ts ON alerts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device_ts ON alerts(device_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_ts ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tariff_versions_eff ON tariff_versions(category, status, effective_from DESC);

-- Asia/Kolkata localized read view for reporting & historical audit
CREATE OR REPLACE VIEW v_telemetry_ist AS
SELECT
  t.id,
  t.device_uuid,
  t.device_id,
  t.voltage_rms,
  t.current_rms,
  t.active_power_w,
  t.apparent_power_va,
  t.power_factor,
  t.frequency_hz,
  t.energy_kwh,
  t.device_timestamp,
  t.ingested_at,
  (t.ingested_at AT TIME ZONE 'Asia/Kolkata') AS ingested_at_ist,
  (t.ingested_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist
FROM telemetry t;
