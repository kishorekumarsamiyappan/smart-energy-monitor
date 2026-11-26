# Deployment Instructions

> **Recommended 100% Free Long-Term Cloud Stack (1–2+ Years):**
> See [CLOUDFLARE_SUPABASE_EMQX_DEPLOYMENT.md](./CLOUDFLARE_SUPABASE_EMQX_DEPLOYMENT.md) for deploying **Supabase + EMQX Cloud Serverless + Cloudflare Workers (`workers/api/`) + Vercel + GitHub Releases FOTA** with automatic 30-day raw telemetry pruning.

## 1. Supabase (Database & Auth)
1. Create a Supabase project in your nearest region (e.g., `ap-south-1` Mumbai for lowest latency to Tamil Nadu).
2. Run `database/migrations/001` through `007` in the Supabase SQL Editor.
3. Enable Email Confirmation & Password Reset redirect URLs under Authentication -> URL Configuration.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` exclusively on the backend server; never expose it in `web/` or `mobile/`.

## 2. EMQX Cloud / Self-Hosted EMQX Broker
1. Provision EMQX with TLS listener on port `8883` (`mqtt/emqx.conf`).
2. Apply topic ACLs from `mqtt/acl.conf` so each device (`DEVICE001`) can publish/subscribe strictly under `energy/DEVICE001/*`.
3. Create the backend ingestor user (`backend-ingestor`) and embed the CA certificate (`ca.crt`) into `firmware/main/main.c` (`DEFAULT_CA_PEM`).

## 3. Backend API + MQTT Worker (`backend/`)
- Deploy using `backend/Dockerfile` to Render, Fly.io, Railway, Cloud Run, or a VPS behind HTTPS TLS.
- Set `NODE_ENV=production`, `PORT=4000`, `CORS_ORIGINS=https://your-vercel-app.vercel.app`, `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `MQTT_ENABLED=true`, `MQTT_BROKER_URL=mqtts://...`.
- Verify health endpoint: `GET https://api.yourdomain.com/api/health`.

## 4. Next.js Website (`web/`) on Vercel
1. Connect repository to Vercel with Root Directory set to `web` (or monorepo workspace build).
2. Set environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy and verify TLS HTTPS routing.

## 5. Android APK / AAB Release (`mobile/`)
1. Configure release keystore (`key.properties`) outside Git.
2. Build signed bundle: `flutter build appbundle --release --dart-define=SEM_API_URL=https://api.yourdomain.com/api`.
3. Verify Android 12+ runtime Bluetooth (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`) and Notification (`POST_NOTIFICATIONS`) prompts on physical Android hardware.
