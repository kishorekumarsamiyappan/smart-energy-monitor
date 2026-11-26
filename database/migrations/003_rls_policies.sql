-- ==============================================================================
-- 003_rls_policies.sql
-- Strict Row Level Security preventing cross-user data access.
-- Compatible with both Supabase Auth (auth.uid()) and standard PostgreSQL tests.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $fn$
      SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    $fn$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM users WHERE auth_uid = auth.uid() OR id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE (auth_uid = auth.uid() OR id = auth.uid())
      AND role = 'admin'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_device(p_device_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM devices d
    WHERE d.id = p_device_uuid
      AND (
        d.owner_user_id = public.current_app_user_id()
        OR public.current_app_user_id() = ANY(d.shared_user_ids)
        OR public.is_admin()
      )
  );
$$;

-- Enable RLS across all 19 tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS users_self_or_admin_select ON users;
CREATE POLICY users_self_or_admin_select ON users
  FOR SELECT USING (id = public.current_app_user_id() OR auth_uid = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users
  FOR UPDATE USING (id = public.current_app_user_id() OR public.is_admin());

-- Devices policies
DROP POLICY IF EXISTS devices_owner_select ON devices;
CREATE POLICY devices_owner_select ON devices
  FOR SELECT USING (
    owner_user_id = public.current_app_user_id()
    OR public.current_app_user_id() = ANY(shared_user_ids)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS devices_owner_insert ON devices;
CREATE POLICY devices_owner_insert ON devices
  FOR INSERT WITH CHECK (owner_user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS devices_owner_update ON devices;
CREATE POLICY devices_owner_update ON devices
  FOR UPDATE USING (owner_user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS devices_owner_delete ON devices;
CREATE POLICY devices_owner_delete ON devices
  FOR DELETE USING (owner_user_id = public.current_app_user_id() OR public.is_admin());

-- Device credentials (strictly owner or admin; never public)
DROP POLICY IF EXISTS device_credentials_owner ON device_credentials;
CREATE POLICY device_credentials_owner ON device_credentials
  FOR ALL USING (public.user_owns_device(device_uuid));

-- Device status, telemetry, energy counters & daily rollups
DROP POLICY IF EXISTS device_status_owner ON device_status;
CREATE POLICY device_status_owner ON device_status
  FOR ALL USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS telemetry_owner ON telemetry;
CREATE POLICY telemetry_owner ON telemetry
  FOR SELECT USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS energy_counters_owner ON energy_counters;
CREATE POLICY energy_counters_owner ON energy_counters
  FOR SELECT USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS energy_daily_owner ON energy_daily;
CREATE POLICY energy_daily_owner ON energy_daily
  FOR SELECT USING (public.user_owns_device(device_uuid));

-- Billing, manual readings, estimates & actual bills
DROP POLICY IF EXISTS billing_cycles_owner ON billing_cycles;
CREATE POLICY billing_cycles_owner ON billing_cycles
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS manual_readings_owner ON manual_readings;
CREATE POLICY manual_readings_owner ON manual_readings
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS bill_estimates_owner ON bill_estimates;
CREATE POLICY bill_estimates_owner ON bill_estimates
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS actual_bills_owner ON actual_bills;
CREATE POLICY actual_bills_owner ON actual_bills
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

-- Alerts & alert rules
DROP POLICY IF EXISTS alerts_owner ON alerts;
CREATE POLICY alerts_owner ON alerts
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS alert_rules_owner ON alert_rules;
CREATE POLICY alert_rules_owner ON alert_rules
  FOR ALL USING (user_id = public.current_app_user_id() OR public.is_admin());

-- Calibration: read for device owner, write strictly admin only
DROP POLICY IF EXISTS calibration_owner_select ON calibration_records;
CREATE POLICY calibration_owner_select ON calibration_records
  FOR SELECT USING (public.user_owns_device(device_uuid));

DROP POLICY IF EXISTS calibration_admin_write ON calibration_records;
CREATE POLICY calibration_admin_write ON calibration_records
  FOR ALL USING (public.is_admin());

-- Tariffs & firmware: read for all authenticated users, write strictly admin
DROP POLICY IF EXISTS tariff_versions_read ON tariff_versions;
CREATE POLICY tariff_versions_read ON tariff_versions
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS tariff_versions_admin ON tariff_versions;
CREATE POLICY tariff_versions_admin ON tariff_versions
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS tariff_slabs_read ON tariff_slabs;
CREATE POLICY tariff_slabs_read ON tariff_slabs
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS tariff_slabs_admin ON tariff_slabs;
CREATE POLICY tariff_slabs_admin ON tariff_slabs
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS subsidy_rules_read ON subsidy_rules;
CREATE POLICY subsidy_rules_read ON subsidy_rules
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS subsidy_rules_admin ON subsidy_rules;
CREATE POLICY subsidy_rules_admin ON subsidy_rules
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS firmware_versions_read ON firmware_versions;
CREATE POLICY firmware_versions_read ON firmware_versions
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS firmware_versions_admin ON firmware_versions;
CREATE POLICY firmware_versions_admin ON firmware_versions
  FOR ALL USING (public.is_admin());

-- Audit logs: admin or own actions read-only
DROP POLICY IF EXISTS audit_logs_read ON audit_logs;
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT USING (actor_user_id = public.current_app_user_id() OR public.is_admin());
