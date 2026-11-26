-- ==============================================================================
-- 001_initial_schema.sql
-- Smart Energy Monitor - Core PostgreSQL Schema (19 Required Tables + Shared Access)
-- All timestamps stored strictly in UTC (TIMESTAMPTZ).
-- ==============================================================================

-- Uses PostgreSQL 13+ native gen_random_uuid() (compatible with Supabase & PGlite).

-- Custom domain enums
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reading_source_enum AS ENUM ('automatic_esp32', 'manual_eb_meter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tariff_branch_enum AS ENUM ('UPTO_500', 'ABOVE_500', 'BASE_NON_SUBSIDY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tariff_status_enum AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity_enum AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_status_enum AS ENUM ('active', 'acknowledged', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid UUID UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  mobile_number VARCHAR(20) NOT NULL UNIQUE,
  password_hash TEXT,
  role user_role_enum NOT NULL DEFAULT 'user',
  organization VARCHAR(120),
  avatar_url TEXT,
  theme_preference VARCHAR(16) NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark', 'system')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. firmware_versions (referenced by devices)
CREATE TABLE IF NOT EXISTS firmware_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(40) NOT NULL UNIQUE,
  hardware_target VARCHAR(60) NOT NULL DEFAULT 'ESP32-S3-ADS131M02',
  release_notes TEXT,
  checksum_sha256 VARCHAR(64),
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. devices
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(64) NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  location_label VARCHAR(80),
  service_category VARCHAR(20) NOT NULL DEFAULT 'LT-IA',
  consumer_eligible_for_subsidy BOOLEAN NOT NULL DEFAULT TRUE,
  meter_serial_number VARCHAR(40),
  firmware_version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  hardware_version VARCHAR(60) NOT NULL DEFAULT 'ESP32-S3-ADS131M02-REV2',
  telemetry_interval_sec INTEGER NOT NULL DEFAULT 5 CHECK (telemetry_interval_sec BETWEEN 1 AND 3600),
  monitoring_mode VARCHAR(24) NOT NULL DEFAULT 'automatic' CHECK (monitoring_mode IN ('automatic', 'manual_preferred')),
  shared_user_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. device_credentials (MQTT over TLS / API device auth secrets hashed)
CREATE TABLE IF NOT EXISTS device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  mqtt_username VARCHAR(80) NOT NULL UNIQUE,
  mqtt_password_hash TEXT NOT NULL,
  client_cert_fingerprint VARCHAR(128),
  ble_pop_hash TEXT,
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. device_status
CREATE TABLE IF NOT EXISTS device_status (
  device_uuid UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  wifi_rssi_dbm INTEGER,
  last_seen_at TIMESTAMPTZ,
  last_lwt_at TIMESTAMPTZ,
  adc_spi_ok BOOLEAN NOT NULL DEFAULT TRUE,
  drdy_status_ok BOOLEAN NOT NULL DEFAULT TRUE,
  sensor_health_status VARCHAR(24) NOT NULL DEFAULT 'good' CHECK (sensor_health_status IN ('good', 'degraded', 'fault')),
  last_reset_reason VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. telemetry (time-series electrical readings; UTC device & server timestamps)
CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_id VARCHAR(64) NOT NULL,
  voltage_rms NUMERIC(8, 3) NOT NULL CHECK (voltage_rms >= 0 AND voltage_rms <= 450),
  current_rms NUMERIC(8, 3) NOT NULL CHECK (current_rms >= 0 AND current_rms <= 100),
  active_power_w NUMERIC(10, 3) NOT NULL CHECK (active_power_w BETWEEN -35000 AND 35000),
  apparent_power_va NUMERIC(10, 3) NOT NULL CHECK (apparent_power_va >= 0 AND apparent_power_va <= 40000),
  power_factor NUMERIC(5, 4) NOT NULL CHECK (power_factor BETWEEN -1.0 AND 1.0),
  frequency_hz NUMERIC(6, 3) NOT NULL CHECK (frequency_hz = 0 OR (frequency_hz BETWEEN 40 AND 70)),
  energy_kwh NUMERIC(14, 4) NOT NULL CHECK (energy_kwh >= 0),
  wifi_rssi_dbm INTEGER,
  message_seq BIGINT,
  device_timestamp TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_telemetry_device_ts UNIQUE (device_uuid, device_timestamp)
);

-- 7. energy_counters (persistent lifetime kWh + counter reset offset protection)
CREATE TABLE IF NOT EXISTS energy_counters (
  device_uuid UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  lifetime_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (lifetime_kwh >= 0),
  last_reported_device_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (last_reported_device_kwh >= 0),
  reset_offset_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (reset_offset_kwh >= 0),
  counter_reset_count INTEGER NOT NULL DEFAULT 0,
  last_reset_detected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. energy_daily (aggregated daily rollups in Asia/Kolkata calendar days)
CREATE TABLE IF NOT EXISTS energy_daily (
  id BIGSERIAL PRIMARY KEY,
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  day_ist DATE NOT NULL,
  start_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0,
  end_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0,
  consumed_kwh NUMERIC(14, 4) NOT NULL DEFAULT 0,
  min_voltage_v NUMERIC(8, 3),
  max_voltage_v NUMERIC(8, 3),
  avg_voltage_v NUMERIC(8, 3),
  peak_power_w NUMERIC(10, 3),
  avg_power_w NUMERIC(10, 3),
  avg_power_factor NUMERIC(5, 4),
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_energy_daily_dev_day UNIQUE (device_uuid, day_ist)
);

-- 9. tariff_versions
CREATE TABLE IF NOT EXISTS tariff_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code VARCHAR(64) NOT NULL UNIQUE,
  category VARCHAR(20) NOT NULL DEFAULT 'LT-IA',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status tariff_status_enum NOT NULL DEFAULT 'draft',
  is_indicative BOOLEAN NOT NULL DEFAULT TRUE,
  official_verified BOOLEAN NOT NULL DEFAULT FALSE,
  source_reference TEXT NOT NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. tariff_slabs (base & conditional branches separate from subsidy)
CREATE TABLE IF NOT EXISTS tariff_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_version_id UUID NOT NULL REFERENCES tariff_versions(id) ON DELETE CASCADE,
  slab_order INTEGER NOT NULL,
  branch tariff_branch_enum NOT NULL,
  from_unit NUMERIC(10, 2) NOT NULL CHECK (from_unit >= 0),
  to_unit NUMERIC(10, 2),
  rate_per_unit_inr NUMERIC(10, 4) NOT NULL CHECK (rate_per_unit_inr >= 0),
  fixed_charge_inr NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fixed_charge_inr >= 0),
  description VARCHAR(160) NOT NULL
);

-- 11. subsidy_rules (stored strictly separately from base tariff rates)
CREATE TABLE IF NOT EXISTS subsidy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_version_id UUID NOT NULL UNIQUE REFERENCES tariff_versions(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  free_units_upto_500 INTEGER NOT NULL DEFAULT 200 CHECK (free_units_upto_500 >= 0),
  free_units_above_500 INTEGER NOT NULL DEFAULT 100 CHECK (free_units_above_500 >= 0),
  eligibility_required BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT
);

-- 12. billing_cycles (bi-monthly periods preserving start/end readings)
CREATE TABLE IF NOT EXISTS billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cycle_start_kwh NUMERIC(14, 4) NOT NULL CHECK (cycle_start_kwh >= 0),
  cycle_end_kwh NUMERIC(14, 4) NOT NULL CHECK (cycle_end_kwh >= 0),
  units_consumed NUMERIC(14, 4) NOT NULL CHECK (units_consumed >= 0),
  reading_source reading_source_enum NOT NULL DEFAULT 'automatic_esp32',
  tariff_version_id UUID REFERENCES tariff_versions(id),
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'estimated', 'billed', 'discrepancy_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. manual_readings (preserved strictly separate from ESP32 automatic telemetry)
CREATE TABLE IF NOT EXISTS manual_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_reading NUMERIC(14, 4) NOT NULL CHECK (previous_reading >= 0),
  previous_reading_date DATE NOT NULL,
  current_reading NUMERIC(14, 4) NOT NULL CHECK (current_reading >= previous_reading),
  current_reading_date DATE NOT NULL,
  units_consumed NUMERIC(14, 4) NOT NULL CHECK (units_consumed >= 0),
  meter_serial_number VARCHAR(40),
  bill_photo_url TEXT,
  notes TEXT,
  automatic_comparison_kwh NUMERIC(14, 4),
  discrepancy_kwh NUMERIC(14, 4),
  discrepancy_percent NUMERIC(8, 2),
  selected_for_estimate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_manual_reading_dedup UNIQUE (device_uuid, current_reading_date, current_reading)
);

-- 14. bill_estimates (stores full calculation inputs, slab lines & warnings)
CREATE TABLE IF NOT EXISTS bill_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_cycle_id UUID REFERENCES billing_cycles(id) ON DELETE CASCADE,
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tariff_version_id UUID REFERENCES tariff_versions(id),
  reading_source reading_source_enum NOT NULL,
  consumer_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  previous_reading NUMERIC(14, 4) NOT NULL,
  current_reading NUMERIC(14, 4) NOT NULL,
  units_consumed NUMERIC(14, 4) NOT NULL,
  free_units_applied NUMERIC(10, 4) NOT NULL DEFAULT 0,
  energy_charges_inr NUMERIC(12, 2) NOT NULL,
  fixed_charges_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  additional_charges_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_estimated_amount_inr NUMERIC(12, 2) NOT NULL,
  calculation_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. actual_bills (user-entered official TNPDCL/TNEB bill for comparison)
CREATE TABLE IF NOT EXISTS actual_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_cycle_id UUID NOT NULL UNIQUE REFERENCES billing_cycles(id) ON DELETE CASCADE,
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actual_amount_inr NUMERIC(12, 2) NOT NULL CHECK (actual_amount_inr >= 0),
  official_bill_number VARCHAR(64),
  bill_date DATE,
  variance_inr NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. alert_rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(40) NOT NULL,
  threshold_value NUMERIC(12, 3) NOT NULL,
  comparison_operator VARCHAR(20) NOT NULL CHECK (comparison_operator IN ('gt', 'lt', 'outside_range')),
  secondary_threshold NUMERIC(12, 3),
  severity alert_severity_enum NOT NULL DEFAULT 'warning',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(40) NOT NULL,
  threshold_value NUMERIC(12, 3) NOT NULL,
  observed_value NUMERIC(12, 3) NOT NULL,
  severity alert_severity_enum NOT NULL DEFAULT 'warning',
  status alert_status_enum NOT NULL DEFAULT 'active',
  message TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. calibration_records
CREATE TABLE IF NOT EXISTS calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  voltage_sensor_model VARCHAR(40) NOT NULL DEFAULT 'ZMPT101B',
  current_sensor_model VARCHAR(60) NOT NULL DEFAULT 'SCT-013 (30A / 1V built-in burden)',
  adc_model VARCHAR(40) NOT NULL DEFAULT 'ADS131M02',
  voltage_cal_factor NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  current_cal_factor NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  phase_correction_deg NUMERIC(8, 4) NOT NULL DEFAULT 0.0,
  nominal_frequency_hz NUMERIC(6, 2) NOT NULL DEFAULT 50.0,
  calibration_status VARCHAR(24) NOT NULL DEFAULT 'factory_default',
  calibrated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- 19. audit_logs (immutable accountability trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
