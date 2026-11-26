-- ==============================================================================
-- 007_cloudflare_worker_rpc_and_retention.sql
-- Atomic PostgreSQL RPC functions for Cloudflare Workers (via Supabase PostgREST)
-- and long-term 1-2+ year free-tier storage retention (30-day raw telemetry pruning
-- while preserving energy_daily, energy_counters, and billing_cycles indefinitely).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sem_ingest_telemetry(
  p_device_id VARCHAR,
  p_voltage_rms NUMERIC,
  p_current_rms NUMERIC,
  p_active_power_w NUMERIC,
  p_apparent_power_va NUMERIC,
  p_power_factor NUMERIC,
  p_frequency_hz NUMERIC,
  p_energy_kwh NUMERIC,
  p_wifi_rssi_dbm INTEGER,
  p_message_seq BIGINT,
  p_device_timestamp TIMESTAMPTZ,
  p_is_buffered BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device RECORD;
  v_max_ts TIMESTAMPTZ;
  v_is_backfill BOOLEAN := FALSE;
  v_counter RECORD;
  v_lifetime NUMERIC(14, 4);
  v_offset NUMERIC(14, 4);
  v_reset_count INTEGER;
  v_reset_detected BOOLEAN := FALSE;
  v_inserted_id BIGINT;
  v_day_ist DATE;
  v_effective_kwh NUMERIC(14, 4);
BEGIN
  SELECT id, owner_user_id INTO v_device
  FROM public.devices
  WHERE device_id = p_device_id
  LIMIT 1;

  IF v_device.id IS NULL THEN
    RAISE EXCEPTION 'DEVICE_NOT_FOUND:%', p_device_id;
  END IF;

  INSERT INTO public.energy_counters (device_uuid, lifetime_kwh, last_reported_device_kwh)
  VALUES (v_device.id, 0, 0)
  ON CONFLICT (device_uuid) DO NOTHING;

  SELECT MAX(device_timestamp) INTO v_max_ts
  FROM public.telemetry
  WHERE device_uuid = v_device.id;

  IF v_max_ts IS NOT NULL AND p_device_timestamp < v_max_ts THEN
    v_is_backfill := TRUE;
  END IF;

  SELECT * INTO v_counter
  FROM public.energy_counters
  WHERE device_uuid = v_device.id
  FOR UPDATE;

  v_offset := COALESCE(v_counter.reset_offset_kwh, 0);
  v_lifetime := COALESCE(v_counter.lifetime_kwh, 0);
  v_reset_count := COALESCE(v_counter.counter_reset_count, 0);

  IF NOT v_is_backfill THEN
    IF COALESCE(v_counter.last_reported_device_kwh, 0) > 0
       AND (p_energy_kwh + 0.001) < v_counter.last_reported_device_kwh THEN
      v_reset_detected := TRUE;
      v_reset_count := v_reset_count + 1;
      v_offset := v_offset + v_counter.last_reported_device_kwh;
      v_lifetime := GREATEST(v_lifetime, v_offset + p_energy_kwh);
      UPDATE public.energy_counters
      SET lifetime_kwh = v_lifetime,
          last_reported_device_kwh = p_energy_kwh,
          reset_offset_kwh = v_offset,
          counter_reset_count = v_reset_count,
          last_reset_detected_at = NOW(),
          updated_at = NOW()
      WHERE device_uuid = v_device.id;
    ELSE
      v_lifetime := GREATEST(v_lifetime, v_offset + p_energy_kwh);
      UPDATE public.energy_counters
      SET lifetime_kwh = v_lifetime,
          last_reported_device_kwh = p_energy_kwh,
          updated_at = NOW()
      WHERE device_uuid = v_device.id;
    END IF;
    v_effective_kwh := v_lifetime;
  ELSE
    v_effective_kwh := p_energy_kwh;
  END IF;

  INSERT INTO public.telemetry (
    device_uuid, device_id, voltage_rms, current_rms, active_power_w,
    apparent_power_va, power_factor, frequency_hz, energy_kwh,
    wifi_rssi_dbm, message_seq, device_timestamp, is_buffered
  )
  VALUES (
    v_device.id, p_device_id, p_voltage_rms, p_current_rms, p_active_power_w,
    p_apparent_power_va, p_power_factor, p_frequency_hz, v_effective_kwh,
    p_wifi_rssi_dbm, p_message_seq, p_device_timestamp, p_is_buffered
  )
  ON CONFLICT (device_uuid, device_timestamp) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    v_day_ist := (p_device_timestamp AT TIME ZONE 'Asia/Kolkata')::date;

    INSERT INTO public.energy_daily (
      device_uuid, day_ist, start_kwh, end_kwh, consumed_kwh,
      min_voltage_v, max_voltage_v, avg_voltage_v, peak_power_w,
      avg_power_w, avg_power_factor, sample_count
    )
    VALUES (
      v_device.id, v_day_ist, v_effective_kwh, v_effective_kwh, 0,
      p_voltage_rms, p_voltage_rms, p_voltage_rms, p_active_power_w,
      p_active_power_w, p_power_factor, 1
    )
    ON CONFLICT (device_uuid, day_ist) DO UPDATE SET
      start_kwh = LEAST(public.energy_daily.start_kwh, EXCLUDED.start_kwh),
      end_kwh = GREATEST(public.energy_daily.end_kwh, EXCLUDED.end_kwh),
      consumed_kwh = GREATEST(0, GREATEST(public.energy_daily.end_kwh, EXCLUDED.end_kwh) - LEAST(public.energy_daily.start_kwh, EXCLUDED.start_kwh)),
      min_voltage_v = LEAST(public.energy_daily.min_voltage_v, EXCLUDED.min_voltage_v),
      max_voltage_v = GREATEST(public.energy_daily.max_voltage_v, EXCLUDED.max_voltage_v),
      avg_voltage_v = ((public.energy_daily.avg_voltage_v * public.energy_daily.sample_count) + EXCLUDED.avg_voltage_v) / (public.energy_daily.sample_count + 1),
      peak_power_w = GREATEST(public.energy_daily.peak_power_w, EXCLUDED.peak_power_w),
      avg_power_w = ((public.energy_daily.avg_power_w * public.energy_daily.sample_count) + EXCLUDED.avg_power_w) / (public.energy_daily.sample_count + 1),
      avg_power_factor = ((public.energy_daily.avg_power_factor * public.energy_daily.sample_count) + EXCLUDED.avg_power_factor) / (public.energy_daily.sample_count + 1),
      sample_count = public.energy_daily.sample_count + 1,
      updated_at = NOW();
  END IF;

  IF NOT v_is_backfill THEN
    INSERT INTO public.device_status (device_uuid, is_online, wifi_rssi_dbm, last_seen_at, updated_at)
    VALUES (v_device.id, TRUE, p_wifi_rssi_dbm, NOW(), NOW())
    ON CONFLICT (device_uuid) DO UPDATE SET
      is_online = TRUE,
      wifi_rssi_dbm = COALESCE(EXCLUDED.wifi_rssi_dbm, public.device_status.wifi_rssi_dbm),
      last_seen_at = NOW(),
      updated_at = NOW();

    UPDATE public.billing_cycles
    SET cycle_end_kwh = GREATEST(cycle_start_kwh, v_lifetime),
        units_consumed = GREATEST(0, GREATEST(cycle_start_kwh, v_lifetime) - cycle_start_kwh)
    WHERE device_uuid = v_device.id AND status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'inserted', (v_inserted_id IS NOT NULL),
    'isHistoricalBackfill', v_is_backfill,
    'deviceUuid', v_device.id,
    'ownerUserId', v_device.owner_user_id,
    'lifetimeKwh', v_lifetime,
    'counterResetDetected', v_reset_detected
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sem_prune_old_telemetry(
  p_retention_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER := GREATEST(7, COALESCE(p_retention_days, 30));
  v_cutoff TIMESTAMPTZ := NOW() - make_interval(days => v_days);
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.telemetry
  WHERE device_timestamp < v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deletedRows', v_deleted,
    'retentionDays', v_days,
    'prunedBeforeUtc', v_cutoff
  );
END;
$$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.sem_ingest_telemetry(VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, BIGINT, TIMESTAMPTZ, BOOLEAN) TO service_role;
  GRANT EXECUTE ON FUNCTION public.sem_prune_old_telemetry(INTEGER) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
