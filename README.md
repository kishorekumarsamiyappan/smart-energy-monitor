# Smart Energy Monitor

Complete full-stack IoT single-phase domestic electricity monitoring & Tamil Nadu (TNEB / TNPDCL LT-IA) billing estimation platform across **Next.js Web**, **Flutter Android Mobile**, **Node.js / TypeScript + MQTT Backend**, **PostgreSQL / Supabase**, and **ESP32-S3 + ADS131M02 Firmware**.

## Repository Structure
- `packages/shared/`: Shared TypeScript domain types, Zod validation schemas, TNEB LT-IA billing engine (`calculateTnebBill`), energy math, Asia/Kolkata formatters, and isolated Demo Mode data generator.
- `database/`: 7 PostgreSQL/Supabase migrations (`23` tables, indexes, `Asia/Kolkata` IST views, strict Row Level Security, audit triggers, indicative 2026 TNEB seed, FOTA/Relays/LEDs/Offline buffer, plus atomic Cloudflare Worker RPC & retention pruning) + embedded PostgreSQL RLS verification tests.
- `workers/api/`: **Cloudflare Workers** serverless Hono API (`POST /api/webhooks/emqx` Rule Engine HTTP ingestion, EMQX REST API v5 downlink publisher, WebCrypto PBKDF2 + HS256 auth, GitHub FOTA, TNEB billing, `<1ms` PDF/CSV exports, and daily 30-day raw telemetry retention Cron) targeting **Supabase + EMQX Cloud Serverless** free tier.
- `backend/`: Express + TypeScript REST API + stateful MQTT worker (alternative Docker/VM deployment option).
- `web/`: Responsive Next.js + React + TypeScript application (Light & Dark modes, AVR-inspired Indigo/Lavender UI, interactive Min/Max + range-scrubber charts, Demo Mode, Billing, Manual Meter Reading, Relays & Offline Schedules, GitHub FOTA Installer, Inbuilt RGB / Single LED & Pulse LED config, Admin Console, CSV/PDF export).
- `mobile/`: Flutter Android-first application with matching AVR Indigo/Lavender UI, BLE provisioning (`flutter_blue_plus`), Relays & Offline Schedules screen, GitHub FOTA Installer & LED configuration, local push notifications (`flutter_local_notifications`), CSV/PDF sharing, and mirrored TNEB billing engine.
- `firmware/`: Modular ESP-IDF C firmware for ESP32-S3 (`main/`, `adc/`, `sensors/`, `signal_processing/`, `power_calculation/`, `energy_counter/`, `calibration/`, `ble_provisioning/`, `wifi_manager/`, `mqtt_client/`, `persistent_storage/`, `watchdog/`, `offline_buffer/`, `relay_controller/`, `led_indicator/`, `fota/`).
- `mqtt/`: EMQX TLS configuration, topic-level ACL rules (`acl.conf`), and local TLS certificate generator.
- `docs/`: Architecture, Database, API, ESP32 Wiring & Safety, HIL Test Plan, Installation, Deployment, and Production Readiness Checklist.

## Exact Install, Run & Test Commands

### 1. Install & Build JS/TS Workspaces
```bash
npm install
npm run build
```

### 2. Run All Automated Tests (Shared + PostgreSQL RLS + Backend API/MQTT + Web)
```bash
npm test
```
Individual suites:
```bash
npm run test:shared    # 28 unit & TNEB boundary tests
npm run test:db        # PostgreSQL migrations & Row Level Security enforcement
npm run test:backend   # REST API + Aedes MQTT broker integration tests
npm run test:web       # React/Next.js component & phase tests
```

### 3. Run Local Dev Servers
```bash
npm run dev:backend    # http://localhost:4000 (uses embedded PGlite if DATABASE_URL unset)
npm run dev:web        # http://localhost:3000
```
Or launch the full stack with PostgreSQL & EMQX via Docker:
```bash
docker compose up --build
```

### 4. Flutter Mobile App (`mobile/`)
```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

### 5. ESP32-S3 Firmware (`firmware/`)
*(Requires Espressif ESP-IDF v5.x toolchain installed locally)*
```bash
cd firmware
idf.py set-target esp32s3
idf.py build
```

## Important Disclaimers
1. **Electrical Safety**: The ESP32-S3 monitor is an advisory monitoring device only and is **not** a circuit breaker or protective relay. Qualified electrical inspection is required before mains connection (`docs/ESP32_WIRING_AND_SAFETY.md`).
2. **Indicative Tariff Notice**: Seeded 2026 TNEB LT-IA rates are indicative estimates only until verified and approved by an administrator against official TNERC/TNPDCL tariff & subsidy orders.
3. **Demo Mode**: Clearly labeled Demo Mode operates purely on isolated sample data and never mixes with production telemetry.
