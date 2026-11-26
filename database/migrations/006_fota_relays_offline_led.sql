-- ==============================================================================
-- 006_fota_relays_offline_led.sql
-- Adds GitHub Releases FOTA, Multi-Relay Offline Schedules, Local Offline Buffering,
-- Consumption Indication Pulse LED, and Inbuilt RGB / Single Status LED config.
-- ==============================================================================

-- Extend telemetry & device_status for offline buffered backfill and OTA tracking
ALTER TABLE telemetry
  ADD COLUMN IF NOT EXISTS is_buffered BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE device_status
  ADD COLUMN IF NOT EXISTS offline_buffered_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ota_status VARCHAR(24) NOT NULL DEFAULT 'idle';

-- Extend firmware_versions for GitHub Releases FOTA assets
ALTER TABLE firmware_versions
  ADD COLUMN IF NOT EXISTS github_repo VARCHAR(160),
  ADD COLUMN IF NOT EXISTS tag_name VARCHAR(64),
  ADD COLUMN IF NOT EXISTS binary_url TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

UPDATE firmware_versions
SET tag_name = COALESCE(tag_name, 'v' || version)
WHERE tag_name IS NULL;

-- 20. device_io_configs (Status RGB/Single LED + External Consumption Pulse LED + Offline Buffer)
CREATE TABLE IF NOT EXISTS device_io_configs (
  device_uuid UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  status_led_mode VARCHAR(20) NOT NULL DEFAULT 'inbuilt_rgb' CHECK (status_led_mode IN ('inbuilt_rgb', 'single_gpio', 'disabled')),
  status_rgb_gpio INTEGER NOT NULL DEFAULT 48 CHECK (status_rgb_gpio BETWEEN 1 AND 48),
  status_single_led_gpio INTEGER NOT NULL DEFAULT 2 CHECK (status_single_led_gpio BETWEEN 1 AND 48),
  pulse_led_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pulse_led_gpio INTEGER NOT NULL DEFAULT 21 CHECK (pulse_led_gpio BETWEEN 1 AND 48),
  pulse_imp_per_kwh INTEGER NOT NULL DEFAULT 1600 CHECK (pulse_imp_per_kwh BETWEEN 100 AND 10000),
  offline_buffer_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  offline_buffered_count INTEGER NOT NULL DEFAULT 0 CHECK (offline_buffered_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. device_relays (1 confirmed default relay CH1 + user-added expansion relays CH2..CH8)
CREATE TABLE IF NOT EXISTS device_relays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  channel_index INTEGER NOT NULL CHECK (channel_index BETWEEN 1 AND 8),
  name VARCHAR(60) NOT NULL,
  gpio_pin INTEGER NOT NULL CHECK (gpio_pin BETWEEN 1 AND 48),
  active_high BOOLEAN NOT NULL DEFAULT TRUE,
  current_state BOOLEAN NOT NULL DEFAULT FALSE,
  fail_safe_state BOOLEAN NOT NULL DEFAULT FALSE,
  is_confirmed_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_relay_channel UNIQUE (device_uuid, channel_index)
);

-- 22. relay_schedules (synced to ESP32 NVS for 100% offline RTC execution)
CREATE TABLE IF NOT EXISTS relay_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relay_id UUID NOT NULL REFERENCES device_relays(id) ON DELETE CASCADE,
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  label VARCHAR(60) NOT NULL DEFAULT 'Scheduled Load',
  start_time_ist VARCHAR(5) NOT NULL CHECK (start_time_ist ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  stop_time_ist VARCHAR(5) NOT NULL CHECK (stop_time_ist ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone VARCHAR(32) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. firmware_ota_jobs (FOTA install/update tracking)
CREATE TABLE IF NOT EXISTS firmware_ota_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_version VARCHAR(40) NOT NULL,
  binary_url TEXT NOT NULL,
  checksum_sha256 VARCHAR(64),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'downloading', 'verifying', 'flashing', 'rebooting', 'succeeded', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_relays_dev ON device_relays(device_uuid, channel_index);
CREATE INDEX IF NOT EXISTS idx_relay_schedules_relay ON relay_schedules(relay_id);
CREATE INDEX IF NOT EXISTS idx_ota_jobs_dev_ts ON firmware_ota_jobs(device_uuid, created_at DESC);

-- RLS Policies for new tables
ALTER TABLE device_io_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_relays ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware_ota_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_io_configs_owner ON device_io_configs;
CREATE POLICY device_io_configs_owner ON device_io_configs
  FOR ALL USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS device_relays_owner ON device_relays;
CREATE POLICY device_relays_owner ON device_relays
  FOR ALL USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS relay_schedules_owner ON relay_schedules;
CREATE POLICY relay_schedules_owner ON relay_schedules
  FOR ALL USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS firmware_ota_jobs_owner ON firmware_ota_jobs;
CREATE POLICY firmware_ota_jobs_owner ON firmware_ota_jobs
  FOR ALL USING (public.user_owns_device(device_uuid));

-- Audit triggers on relays & FOTA jobs
DROP TRIGGER IF EXISTS trg_device_io_touch ON device_io_configs;
CREATE TRIGGER trg_device_io_touch BEFORE UPDATE ON device_io_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_device_relays_touch ON device_relays;
CREATE TRIGGER trg_device_relays_touch BEFORE UPDATE ON device_relays
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ota_jobs_touch ON firmware_ota_jobs;
CREATE TRIGGER trg_ota_jobs_touch BEFORE UPDATE ON firmware_ota_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_audit_ota_jobs ON firmware_ota_jobs;
CREATE TRIGGER trg_audit_ota_jobs
  AFTER INSERT OR UPDATE ON firmware_ota_jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();
