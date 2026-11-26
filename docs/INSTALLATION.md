# Installation & Local Setup Guide

## Prerequisites
- Node.js >= 20 (`v26.12.1` verified) and npm >= 10
- Flutter SDK >= 3.41 & Dart >= 3.11 (for Android app)
- Android SDK Platform + Android `cmdline-tools` + accepted SDK licenses (`flutter doctor --android-licenses`) to build Android APKs
- ESP-IDF v5.x (`idf.py`) for compiling/flashing `firmware/` to ESP32-S3
- Optional: Docker & Docker Compose for local PostgreSQL + EMQX broker

## 1. Environment Variables
```bash
cp .env.example .env
cp .env.example web/.env.local
```
Populate `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_JWT_SECRET`, and `MQTT_*`.
Never commit `.env`, `.env.local`, certificates, or device secrets.

## 2. Install JavaScript/TypeScript Workspaces
```bash
npm install
npm --workspace=packages/shared run build
npm --workspace=backend run build
```

## 3. Run Database Migrations (Supabase / PostgreSQL)
Execute the SQL files in numerical order (`001` through `005`) against your Supabase SQL Editor or `psql`:
```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_indexes_and_views.sql
psql "$DATABASE_URL" -f database/migrations/003_rls_policies.sql
psql "$DATABASE_URL" -f database/migrations/004_triggers_and_audit.sql
psql "$DATABASE_URL" -f database/migrations/005_seed_tariffs.sql
```
*(Local automated tests verify all 5 migrations automatically on embedded PostgreSQL via `npm run test:db`.)*

## 4. Run Backend API & Web App
```bash
npm run dev:backend
npm run dev:web
```
Open `http://localhost:3000`. Use **Try Interactive Demo Mode** if physical hardware or cloud keys are not yet configured.

## 5. Run Flutter Mobile App
```bash
cd mobile
flutter pub get
flutter analyze
flutter test
# Once Android cmdline-tools and licenses are configured:
flutter build apk --release --dart-define=SEM_API_URL=https://api.yourdomain.com/api
```

## 6. Build & Flash ESP32-S3 Firmware
```bash
cd firmware
idf.py set-target esp32s3
idf.py build
idf.py -p COM3 flash monitor
```
