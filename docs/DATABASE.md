# Database Architecture & Schema Documentation

All migrations live in `database/migrations/` and target PostgreSQL 15+ / Supabase:
- `001_initial_schema.sql`: Defines all 19 domain tables and constraints.
- `002_indexes_and_views.sql`: Composite B-tree & BRIN indexes (`device_uuid`, `ingested_at`, `user_id`) and `v_telemetry_ist` (`Asia/Kolkata` projection).
- `003_rls_policies.sql`: Strict Row Level Security across all 19 tables isolating user-owned & shared devices, protecting calibration constants and tariff schedules for admin writes only.
- `004_triggers_and_audit.sql`: `updated_at` timestamp triggers and immutable `audit_logs` triggers for `tariff_versions` and `calibration_records`.
- `005_seed_tariffs.sql`: Indicative 2026 TNEB LT-IA slabs and separate `subsidy_rules` entry (`is_indicative = TRUE`, `official_verified = FALSE`).
- `006_fota_relays_offline_led.sql`: Adds GitHub Release metadata (`firmware_versions`), offline buffered flags (`telemetry.is_buffered`, `device_status.offline_buffered_count`, `ota_status`), and tables `device_io_configs`, `device_relays`, `relay_schedules`, and `firmware_ota_jobs` with Row Level Security policies.
- `007_cloudflare_worker_rpc_and_retention.sql`: Adds atomic PostgreSQL RPC functions `sem_ingest_telemetry(...)` (serverless EMQX webhook ingestion + offline backfill) and `sem_prune_old_telemetry(retention_days)` (called daily by Cloudflare Worker Cron to keep raw rows bounded while preserving `energy_daily`, `energy_counters`, and `billing_cycles` for years).

## Core Tables (23)
1. `users`
2. `devices`
3. `device_credentials`
4. `device_status`
5. `telemetry` (UTC `device_timestamp` + server `ingested_at`, unique `(device_uuid, device_timestamp)`)
6. `energy_counters` (monotonic `lifetime_kwh` + `reset_offset_kwh` + `counter_reset_count`)
7. `energy_daily` (`day_ist` calendar rollups in `Asia/Kolkata`)
8. `billing_cycles` (bi-monthly cycle start/end readings)
9. `manual_readings` (preserved strictly separately from ESP32 telemetry)
10. `tariff_versions` (effective dates, approval metadata, indicative/verified flags)
11. `tariff_slabs` (`UPTO_500`, `ABOVE_500`, and `BASE_NON_SUBSIDY` branches)
12. `subsidy_rules` (free-unit subsidy kept separate from base tariff slabs)
13. `bill_estimates` (full slab-by-slab JSON calculation payload + inputs)
14. `actual_bills` (user-entered TNPDCL bill amounts & variance)
15. `alerts`
16. `alert_rules`
17. `calibration_records`
18. `firmware_versions` (includes `github_repo`, `tag_name`, `binary_url`, `file_size_bytes`)
19. `audit_logs`
20. `device_io_configs` (Status LED mode RGB vs Single GPIO, Consumption Pulse LED GPIO + imp/kWh, offline buffer setting)
21. `device_relays` (Confirmed `CH1` + user-added expansion relays `CH2..CH8`)
22. `relay_schedules` (Asia/Kolkata start/stop windows synced to ESP32-S3 NVS for offline RTC execution)
23. `firmware_ota_jobs` (MQTT/HTTPS GitHub FOTA progress and job history)
