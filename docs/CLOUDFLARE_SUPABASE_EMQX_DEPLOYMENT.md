# Free 2+ Year Cloud Deployment: Supabase + EMQX Cloud Serverless + Cloudflare Workers + Vercel + GitHub FOTA

This architecture runs **24/7 with zero server sleeping** and stays inside free-tier limits for **1–2+ years (\$0/month)**.

```
[ESP32-S3] --MQTTS (8883)--> [EMQX Cloud Serverless] --HTTP Rule Webhook--> [Cloudflare Worker API] --HTTPS PostgREST/RPC--> [Supabase PostgreSQL]
                                    ^                                               |
                                    |---------- HTTP POST /api/v5/publish ----------|
                                                                                    |--> Daily Cron (30d raw cleanup; keeps daily rollups & billing forever)
[Next.js Web (Vercel)] & [Android App] <------- HTTPS REST API ----------------------|
[ESP32-S3 FOTA] <------ HTTPS GET .bin download -------- [GitHub Releases]
```

---

## Step 1: Supabase Database Setup (500 MB Free Tier)
1. Create a Supabase project in `ap-south-1` (Mumbai).
2. Run all SQL migrations in order in **Supabase SQL Editor**:
   - `database/migrations/001_initial_schema.sql` through `database/migrations/007_cloudflare_worker_rpc_and_retention.sql`.
3. **Why it won't fill 500 MB or auto-pause:**
   - Regular EMQX device telemetry keeps Supabase active daily (avoiding the 7-day inactivity pause).
   - Set device upload interval to **15s–30s** after initial testing.
   - Cloudflare Worker's daily Cron (`0 21 * * *` / 02:30 IST) executes `sem_prune_old_telemetry(30)` so raw `telemetry` keeps a rolling 30-day window while `energy_daily`, `energy_counters`, `manual_readings`, and `billing_cycles` stay intact for **2+ years (< 80 MB total)**.

---

## Step 2: EMQX Cloud Serverless Setup (Free Quota + Hard \$0 Cap)
1. Create a **Serverless** deployment in EMQX Cloud and set **Spend Limit = `$0`**.
2. Create per-device MQTT credentials under Authentication (`sem_device001` / password), matching your device's ESP-IDF NVS provisioning.
3. Configure **Data Integration -> HTTP Server Connector**:
   - URL: `https://<your-worker-name>.<subdomain>.workers.dev/api/webhooks/emqx`
   - Header `x-emqx-webhook-secret`: generate a 32+ char secret matching `EMQX_WEBHOOK_SECRET`.
   - Attach Rule SQL from `mqtt/emqx-webhook-rules.sql` (`"energy/+/telemetry", "energy/+/status", "energy/+/alerts"`).
4. Under **Access Control -> Deployment API**, create an API Key (`EMQX_APP_ID` + `EMQX_APP_SECRET`) and note your REST API endpoint (`https://<cluster>.emqx.cloud:8443`).

---

## Step 3: Cloudflare Worker Deployment (`workers/api/`)
```bash
cd "workers/api"
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put EMQX_WEBHOOK_SECRET
npx wrangler secret put EMQX_API_URL
npx wrangler secret put EMQX_APP_ID
npx wrangler secret put EMQX_APP_SECRET
npx wrangler deploy
```
*(Optional: set `GITHUB_FIRMWARE_REPO` in `workers/api/wrangler.toml` and `GITHUB_TOKEN` secret if using private GitHub firmware repos; public GitHub Releases work without a token.)*

Verify live Worker health:
```bash
curl https://<your-worker>.workers.dev/api/health
```

---

## Step 4: Next.js Website on Vercel (`web/`) & Android App (`mobile/`)
- **Vercel (`web/`)**: Set Root Directory to `web` and configure:
  - `NEXT_PUBLIC_API_URL=https://<your-worker>.workers.dev/api`
- **Flutter Android (`mobile/`)**: Build release APK pointing to your Worker URL:
  ```bash
  flutter build apk --release --dart-define=SEM_API_URL=https://<your-worker>.workers.dev/api
  ```

---

## Step 5: ESP32-S3 Firmware & GitHub Releases FOTA
1. Set `DEFAULT_BROKER_URI` to your EMQX Cloud Serverless `mqtts://<cluster>:8883` endpoint and embed EMQX Serverless CA PEM (`DEFAULT_CA_PEM`) in `firmware/main/main.c`.
2. When publishing new firmware (`1.3.0+`), upload `smart_energy_monitor_esp32s3.bin` as a **GitHub Release** asset.
3. In the Web Admin Console (`Sync Latest Release from GitHub`), sync the release, then click **Install / Update Firmware** from Device Settings in Web or Android.
