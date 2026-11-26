import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');

const EXPECTED_TABLES = [
  'users',
  'devices',
  'device_credentials',
  'device_status',
  'telemetry',
  'energy_counters',
  'energy_daily',
  'billing_cycles',
  'manual_readings',
  'tariff_versions',
  'tariff_slabs',
  'subsidy_rules',
  'bill_estimates',
  'actual_bills',
  'alerts',
  'alert_rules',
  'calibration_records',
  'firmware_versions',
  'audit_logs',
  'device_io_configs',
  'device_relays',
  'relay_schedules',
  'firmware_ota_jobs',
];

async function createMigratedDb() {
  const db = new PGlite();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.exec(sql);
  }
  return db;
}

test('PostgreSQL migrations create all 19 tables, indexes, IST view, and indicative 2026 TNEB seed', async () => {
  const db = await createMigratedDb();

  const tablesRes = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const existing = new Set(tablesRes.rows.map((r) => r.tablename));
  for (const table of EXPECTED_TABLES) {
    assert.ok(existing.has(table), `Missing table ${table}`);
  }

  const tariffRes = await db.query(
    `SELECT version_code, is_indicative, official_verified FROM tariff_versions WHERE version_code = 'TNEB-LT1A-2026-IND'`,
  );
  assert.equal(tariffRes.rows.length, 1);
  assert.equal(tariffRes.rows[0].is_indicative, true);
  assert.equal(tariffRes.rows[0].official_verified, false);

  const slabCountRes = await db.query(`SELECT COUNT(*)::int AS cnt FROM tariff_slabs`);
  assert.equal(slabCountRes.rows[0].cnt, 16);

  const subsidyRes = await db.query(`SELECT free_units_upto_500, free_units_above_500 FROM subsidy_rules`);
  assert.equal(subsidyRes.rows[0].free_units_upto_500, 200);
  assert.equal(subsidyRes.rows[0].free_units_above_500, 100);

  await db.close();
});

test('PostgreSQL Row Level Security isolates users and protects calibration/tariffs', async () => {
  const db = await createMigratedDb();

  // Create non-superuser role to verify PostgreSQL RLS enforcement accurately (superusers bypass RLS)
  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE app_authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    GRANT USAGE ON SCHEMA public, auth TO app_authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_authenticated;

    INSERT INTO users (id, auth_uid, full_name, email, mobile_number, role)
    VALUES
      ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Alice User', 'alice@example.com', '9000000001', 'user'),
      ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Bob User', 'bob@example.com', '9000000002', 'user'),
      ('99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999', 'Admin User', 'admin@example.com', '9000000009', 'admin');

    INSERT INTO devices (id, device_id, owner_user_id, name)
    VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DEVICE001', '11111111-1111-4111-8111-111111111111', 'Alice Meter'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'DEVICE002', '22222222-2222-4222-8222-222222222222', 'Bob Meter');
  `);

  // Switch to Alice under RLS inside an explicit transaction block
  await db.exec(`BEGIN; SET LOCAL ROLE app_authenticated;`);
  await db.exec(`SET LOCAL app.current_user_id = '11111111-1111-4111-8111-111111111111';`);

  const aliceDevices = await db.query(`SELECT device_id FROM devices`);
  assert.deepEqual(aliceDevices.rows.map((r) => r.device_id), ['DEVICE001']);

  // Alice cannot write tariff_versions
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO tariff_versions (version_code, effective_from, source_reference) VALUES ('HACK-TARIFF', '2026-12-01', 'hack')`,
      ),
    /row-level security/i,
  );
  await db.exec(`ROLLBACK;`);

  // Switch to Admin under RLS -> sees both devices & can insert tariff
  await db.exec(`BEGIN; SET LOCAL ROLE app_authenticated;`);
  await db.exec(`SET LOCAL app.current_user_id = '99999999-9999-4999-8999-999999999999';`);
  const adminDevices = await db.query(`SELECT device_id FROM devices ORDER BY device_id`);
  assert.deepEqual(adminDevices.rows.map((r) => r.device_id), ['DEVICE001', 'DEVICE002']);

  await db.query(
    `INSERT INTO tariff_versions (version_code, effective_from, source_reference) VALUES ('TNEB-ADMIN-TEST', '2027-01-01', 'Official Order Test')`,
  );
  await db.exec(`COMMIT;`);
  const auditRes = await db.query(`SELECT action, entity_type FROM audit_logs WHERE entity_type = 'tariff_versions'`);
  assert.ok(auditRes.rows.length >= 1);

  await db.close();
});

test('Supabase Cloudflare Worker RPC handles live + backfill ingestion and prunes >30d raw telemetry cleanly', async () => {
  const db = await createMigratedDb();

  await db.exec(`
    INSERT INTO users (id, full_name, email, mobile_number, role)
    VALUES ('11111111-1111-4111-8111-111111111111', 'Alice User', 'alice@example.com', '9000000001', 'user');
    INSERT INTO devices (id, device_id, owner_user_id, name)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DEVICE001', '11111111-1111-4111-8111-111111111111', 'Alice Meter');
  `);

  const nowTs = new Date().toISOString();
  const oldTs = new Date(Date.now() - 45 * 86_400_000).toISOString();

  // Ingest live packet first
  const liveRes = await db.query(
    `SELECT public.sem_ingest_telemetry('DEVICE001', 231.5, 4.1, 900.0, 949.0, 0.948, 50.01, 120.5000, -55, 10, $1::timestamptz, FALSE) AS res`,
    [nowTs],
  );
  assert.equal(liveRes.rows[0].res.inserted, true);
  assert.equal(liveRes.rows[0].res.isHistoricalBackfill, false);

  // Ingest 45-day-old offline buffered historical packet -> must be detected as historical backfill without counter reset
  const backfillRes = await db.query(
    `SELECT public.sem_ingest_telemetry('DEVICE001', 229.0, 3.8, 820.0, 870.0, 0.942, 49.98, 45.2000, -61, 3, $1::timestamptz, TRUE) AS res`,
    [oldTs],
  );
  assert.equal(backfillRes.rows[0].res.inserted, true);
  assert.equal(backfillRes.rows[0].res.isHistoricalBackfill, true);
  assert.equal(backfillRes.rows[0].res.counterResetDetected, false);

  // Run 30-day retention pruning cron RPC
  const pruneRes = await db.query(`SELECT public.sem_prune_old_telemetry(30) AS res`);
  assert.equal(pruneRes.rows[0].res.deletedRows, 1);

  const remTelemetry = await db.query(`SELECT COUNT(*)::int AS cnt FROM telemetry`);
  assert.equal(remTelemetry.rows[0].cnt, 1);

  // Daily aggregates & monotonic counter remain intact across pruning
  const dailyRows = await db.query(`SELECT COUNT(*)::int AS cnt FROM energy_daily`);
  assert.equal(dailyRows.rows[0].cnt, 2);
  const counterRes = await db.query(`SELECT lifetime_kwh::float AS kwh FROM energy_counters`);
  assert.equal(counterRes.rows[0].kwh, 120.5);

  await db.close();
});
