import assert from 'node:assert/strict';
import test from 'node:test';
import { signJwt } from '../src/crypto';
import { createWorkerApp } from '../src/app';
import { MemoryWorkerStore, SupabaseStore } from '../src/store';
import { WorkerEnv } from '../src/types';

const TEST_ENV: WorkerEnv = {
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  JWT_SECRET: 'worker-integration-test-secret-minimum-32-chars',
  EMQX_WEBHOOK_SECRET: 'emqx-webhook-shared-secret-token',
  EMQX_API_URL: 'https://broker.emqx.cloud:8443/api/v5',
  EMQX_APP_ID: 'app_id_test',
  EMQX_APP_SECRET: 'app_secret_test',
  GITHUB_FIRMWARE_REPO: 'owner/smart-energy-monitor-firmware',
  TELEMETRY_RETENTION_DAYS: '30',
};

test('Cloudflare Worker API: Auth, EMQX Webhook Ingestion, EMQX REST Commands, FOTA, TNEB Billing, PDF & Retention Cron', async () => {
  const store = new MemoryWorkerStore();
  const app = createWorkerApp(() => store);

  // Intercept outbound fetch to inspect EMQX REST v5 publish calls cleanly
  const emqxCalls: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v5/publish')) {
      const headers = new Headers(init?.headers);
      emqxCalls.push({
        url,
        body: JSON.parse(String(init?.body ?? '{}')),
        auth: headers.get('Authorization'),
      });
      return new Response(JSON.stringify({ id: 'emqx-msg-1' }), { status: 200 });
    }
    return origFetch(input, init);
  }) as typeof fetch;

  try {
    // 1. Health endpoint
    const healthRes = await app.request('/api/health', { method: 'GET' }, TEST_ENV);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as { runtime: string; mqttMode: string };
    assert.equal(health.runtime, 'cloudflare-workers');
    assert.equal(health.mqttMode, 'emqx-webhook+rest-v5');

    // 2. Register + Login using WebCrypto PBKDF2-SHA256 & HS256 JWT (<10ms CPU safe)
    const regRes = await app.request(
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Kishore Kumar',
          email: 'kishore@example.com',
          mobileNumber: '9876543210',
          password: 'StrongPassword#2026',
          acceptedTerms: true,
        }),
      },
      TEST_ENV,
    );
    assert.equal(regRes.status, 201);
    const regJson = (await regRes.json()) as { token: string; user: { id: string; role: string } };
    assert.equal(regJson.user.role, 'user');

    // Pair device
    const pairRes = await app.request(
      '/api/devices',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({
          deviceId: 'DEV001',
          name: 'Main Home DB',
          consumerEligibleForSubsidy: true,
        }),
      },
      TEST_ENV,
    );
    assert.equal(pairRes.status, 201);
    const pairJson = (await pairRes.json()) as { device: { deviceId: string } };
    assert.equal(pairJson.device.deviceId, 'DEV001');

    // Add High Power Alert Rule (> 2000 W)
    const ruleRes = await app.request(
      '/api/alerts/rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({
          deviceId: 'DEV001',
          alertType: 'high_power',
          thresholdValue: 2000,
          comparisonOperator: 'gt',
          severity: 'warning',
          enabled: true,
        }),
      },
      TEST_ENV,
    );
    assert.equal(ruleRes.status, 201);

    // 3. EMQX Webhook authentication & anti-spoofing
    const badAuthHook = await app.request(
      '/api/webhooks/emqx',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-emqx-webhook-secret': 'wrong-secret' },
        body: JSON.stringify({ topic: 'energy/DEV001/telemetry', payload: {} }),
      },
      TEST_ENV,
    );
    assert.equal(badAuthHook.status, 401);

    const spoofHook = await app.request(
      '/api/webhooks/emqx',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-emqx-webhook-secret': TEST_ENV.EMQX_WEBHOOK_SECRET },
        body: JSON.stringify({
          topic: 'energy/DEV001/telemetry',
          clientid: 'OTHERDEV',
          payload: { device_id: 'DEV001' },
        }),
      },
      TEST_ENV,
    );
    assert.equal(spoofHook.status, 403);

    // Live telemetry webhook ingestion (>2000 W triggers alert!)
    const liveTs = new Date().toISOString();
    const liveHook = await app.request(
      '/api/webhooks/emqx',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-emqx-webhook-secret': TEST_ENV.EMQX_WEBHOOK_SECRET },
        body: JSON.stringify({
          topic: 'energy/DEV001/telemetry',
          clientid: 'DEV001',
          payload: {
            device_id: 'DEV001',
            voltage_rms: 232.4,
            current_rms: 10.5,
            active_power: 2380.0,
            apparent_power: 2440.0,
            power_factor: 0.975,
            frequency: 50.02,
            energy_kwh: 150.25,
            wifi_rssi: -52,
            seq: 20,
            timestamp: liveTs,
          },
        }),
      },
      TEST_ENV,
    );
    assert.equal(liveHook.status, 200);
    const liveJson = (await liveHook.json()) as { accepted: boolean; isHistoricalBackfill: boolean; lifetimeKwh: number };
    assert.equal(liveJson.accepted, true);
    assert.equal(liveJson.isHistoricalBackfill, false);
    assert.equal(liveJson.lifetimeKwh, 150.25);

    // Offline buffered historical telemetry (45 days old, buffered=true) -> ingested cleanly without alert or counter reset
    const oldTs = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const offHook = await app.request(
      '/api/webhooks/emqx',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-emqx-webhook-secret': TEST_ENV.EMQX_WEBHOOK_SECRET },
        body: JSON.stringify({
          topic: 'energy/DEV001/telemetry',
          clientid: 'DEV001',
          payload: {
            device_id: 'DEV001',
            voltage_rms: 229.0,
            current_rms: 9.8,
            active_power: 2200.0,
            apparent_power: 2244.0,
            power_factor: 0.98,
            frequency: 49.99,
            energy_kwh: 42.1,
            buffered: true,
            timestamp: oldTs,
          },
        }),
      },
      TEST_ENV,
    );
    assert.equal(offHook.status, 200);
    const offJson = (await offHook.json()) as { accepted: boolean; isHistoricalBackfill: boolean };
    assert.equal(offJson.accepted, true);
    assert.equal(offJson.isHistoricalBackfill, true);

    const alertsRes = await app.request(
      '/api/alerts',
      { headers: { Authorization: `Bearer ${regJson.token}` } },
      TEST_ENV,
    );
    const alertsJson = (await alertsRes.json()) as { alerts: Array<unknown> };
    assert.equal(alertsJson.alerts.length, 1); // Only live event fired alert, not historical backfill!

    // 4. Outbound EMQX REST v5 Commands (Optional Relay Add/Toggle/Delete + IO LED + Admin GitHub FOTA)
    const emptyRelRes = await app.request(
      '/api/devices/DEV001/relays',
      { headers: { Authorization: `Bearer ${regJson.token}` } },
      TEST_ENV,
    );
    const { relays: initialRelays } = (await emptyRelRes.json()) as { relays: Array<{ id: string }> };
    assert.equal(initialRelays.length, 0);

    const addRelRes = await app.request(
      '/api/devices/DEV001/relays',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({ name: 'Pump Relay', gpioPin: 15, activeHigh: true, failSafeState: false }),
      },
      TEST_ENV,
    );
    assert.equal(addRelRes.status, 201);
    const { relay: addedRelay } = (await addRelRes.json()) as { relay: { id: string } };

    await app.request(
      `/api/devices/DEV001/relays/${addedRelay.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({ currentState: true }),
      },
      TEST_ENV,
    );

    const delRelRes = await app.request(
      `/api/devices/DEV001/relays/${addedRelay.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${regJson.token}` },
      },
      TEST_ENV,
    );
    assert.equal(delRelRes.status, 200);

    // Forgot-password & single-use reset flow
    const fpRes = await app.request(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'kishore@example.com' }),
      },
      TEST_ENV,
    );
    assert.equal(fpRes.status, 200);
    const fpJson = (await fpRes.json()) as { previewResetToken?: string };
    assert.ok(fpJson.previewResetToken);
    const rpRes = await app.request(
      '/api/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fpJson.previewResetToken, newPassword: 'NewStrongPassword#2026' }),
      },
      TEST_ENV,
    );
    assert.equal(rpRes.status, 200);
    await app.request(
      '/api/devices/DEV001/io-config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({ statusLedMode: 'single_gpio', pulseLedGpio: 21, pulseImpPerKwh: 1600 }),
      },
      TEST_ENV,
    );

    const admin = await store.seedAdmin({
      fullName: 'Admin Operator',
      email: 'admin@example.com',
      mobileNumber: '9000000099',
      password: 'AdminPassword#2026',
    });
    const adminToken = await signJwt({ sub: admin.id, email: admin.email, role: 'admin', jti: 'admin-jti' }, TEST_ENV.JWT_SECRET);

    await app.request(
      '/api/admin/firmware/releases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          version: '1.3.0',
          binaryUrl: 'https://github.com/owner/smart-energy-monitor-firmware/releases/download/v1.3.0/app.bin',
          releaseNotes: 'Cloudflare+EMQX build',
        }),
      },
      TEST_ENV,
    );

    const otaRes = await app.request(
      '/api/devices/DEV001/ota',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regJson.token}` },
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );
    assert.equal(otaRes.status, 202);
    assert.ok(emqxCalls.some((c) => c.body.topic === 'energy/DEV001/command' && String(c.body.payload).includes('ota_update')));
    assert.ok(emqxCalls.some((c) => c.body.topic === 'energy/DEV001/command' && String(c.body.payload).includes('set_relay')));
    assert.ok(emqxCalls.some((c) => c.body.topic === 'energy/DEV001/config' && String(c.body.payload).includes('single_gpio')));
    assert.ok(emqxCalls.every((c) => c.url === 'https://broker.emqx.cloud:8443/api/v5/publish'));
    assert.ok(emqxCalls.every((c) => c.auth?.startsWith('Basic ')));

    // 5. PDF 1.4 Report Export (<0.5ms CPU pure TS) & Retention Pruning Cron
    const pdfRes = await app.request(
      '/api/reports/pdf?deviceId=DEV001&days=7',
      { headers: { Authorization: `Bearer ${regJson.token}` } },
      TEST_ENV,
    );
    assert.equal(pdfRes.status, 200);
    const pdfText = await pdfRes.text();
    assert.ok(pdfText.startsWith('%PDF-1.4'));

    const pruneRes = await app.request(
      '/api/admin/maintenance/prune',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ retentionDays: 30 }),
      },
      TEST_ENV,
    );
    assert.equal(pruneRes.status, 200);
    const pruneJson = (await pruneRes.json()) as { deletedRows: number };
    assert.equal(pruneJson.deletedRows, 1);

    const remHistoryRes = await app.request(
      '/api/devices/DEV001/history?days=90',
      { headers: { Authorization: `Bearer ${regJson.token}` } },
      TEST_ENV,
    );
    const remHistory = (await remHistoryRes.json()) as { points: Array<unknown>; daily: Array<unknown> };
    assert.equal(remHistory.points.length, 1); // Only recent point left in raw telemetry
    assert.equal(remHistory.daily.length, 2);  // Both IST days kept permanently in energy_daily!
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('SupabaseStore normalizes /rest/v1/ suffix and omits Bearer header for modern sb_secret_ keys', async () => {
  const captured: Array<{ url: string; headers: Headers }> = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify([{ id: 'u1' }]), { status: 200 });
  }) as typeof fetch;

  try {
    const store = new SupabaseStore({
      ...TEST_ENV,
      SUPABASE_URL: 'https://demo.supabase.co/rest/v1/',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_dummy_test_key_only',
    });
    await store.listAllUsers();
    assert.equal(captured.length, 1);
    assert.ok(captured[0].url.startsWith('https://demo.supabase.co/rest/v1/users'));
    assert.equal(captured[0].headers.get('apikey'), 'sb_secret_dummy_test_key_only');
    assert.equal(captured[0].headers.get('Authorization'), null);

    // Health still responds cleanly even before secrets are added on initial Cloudflare Worker deploy
    const unconfiguredApp = createWorkerApp((env) => new SupabaseStore(env));
    const hRes = await unconfiguredApp.request('/api/health', { method: 'GET' }, {} as WorkerEnv);
    assert.equal(hRes.status, 200);
    const hJson = (await hRes.json()) as { status: string; configured: { supabase: boolean } };
    assert.equal(hJson.status, 'ok');
    assert.equal(hJson.configured.supabase, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});
