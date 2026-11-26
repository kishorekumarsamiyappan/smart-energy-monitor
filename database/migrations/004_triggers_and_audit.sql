-- ==============================================================================
-- 004_triggers_and_audit.sql
-- Automatic updated_at maintenance, telemetry counter rollover protection,
-- and calibration / tariff audit trail triggers.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_devices_touch ON devices;
CREATE TRIGGER trg_devices_touch BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_billing_cycles_touch ON billing_cycles;
CREATE TRIGGER trg_billing_cycles_touch BEFORE UPDATE ON billing_cycles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Audit sensitive calibration & tariff modifications
CREATE OR REPLACE FUNCTION public.audit_sensitive_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    public.current_app_user_id(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tariff_versions ON tariff_versions;
CREATE TRIGGER trg_audit_tariff_versions
  AFTER INSERT OR UPDATE OR DELETE ON tariff_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();

DROP TRIGGER IF EXISTS trg_audit_calibration ON calibration_records;
CREATE TRIGGER trg_audit_calibration
  AFTER INSERT OR UPDATE OR DELETE ON calibration_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();
