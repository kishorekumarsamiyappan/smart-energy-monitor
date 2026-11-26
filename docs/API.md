# REST API Documentation

Machine-readable OpenAPI 3.1 spec: `backend/src/docs/openapi.json` (also served at `GET /api/docs/openapi.json`).

## Authentication
- `POST /api/auth/register` — Create normal `'user'` account (bcrypt hashed, role cannot self-escalate).
- `POST /api/auth/login` — Authenticate with email OR mobile number + password.
- `POST /api/auth/logout` — Revokes active JWT JTI immediately.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `GET /api/auth/me` / `PATCH /api/auth/profile`

## Devices & Telemetry
- `GET /api/devices`, `POST /api/devices` (returns one-time MQTT credentials), `GET /api/devices/:id`, `PATCH /api/devices/:id`, `DELETE /api/devices/:id`
- `GET /api/devices/:id/latest`, `GET /api/devices/:id/telemetry`, `GET /api/devices/:id/history`
- `GET /api/devices/:id/energy`, `GET /api/devices/:id/energy/daily`, `GET /api/devices/:id/energy/monthly`
- `GET /api/devices/:id/io-config`, `PATCH /api/devices/:id/io-config` (Status LED `inbuilt_rgb` / `single_gpio` / `disabled`, External Consumption Pulse LED GPIO + imp/kWh, Offline Buffer toggle)
- `GET /api/devices/:id/relays`, `POST /api/devices/:id/relays`, `PATCH /api/devices/:id/relays/:relayId`, `DELETE /api/devices/:id/relays/:relayId`
- `POST /api/devices/:id/relays/:relayId/schedules`, `PATCH /api/devices/:id/relays/:relayId/schedules/:scheduleId`, `DELETE /api/devices/:id/relays/:relayId/schedules/:scheduleId`
- `GET /api/devices/:id/firmware`, `POST /api/devices/:id/ota` (Dispatches `ota_update` command over MQTT from GitHub Releases)

## GitHub Releases Firmware FOTA
- `GET /api/firmware/releases` — List registered firmware versions
- `POST /api/admin/firmware/sync-github` — Fetch latest `.bin` release from configured `GITHUB_FIRMWARE_REPO` (Admin only)
- `POST /api/admin/firmware/releases` — Manually register a GitHub `.bin` release URL & SHA-256 (Admin only)

## Billing & Tariffs
- `GET /api/billing/current`
- `POST /api/billing/calculate`
- `POST /api/billing/manual-reading` (compares against ESP32 kWh, detects discrepancies, preserves both records)
- `GET /api/billing/history`, `GET /api/billing/:id`, `PATCH /api/billing/:id/actual`
- `GET /api/tariffs/current`, `GET /api/tariffs/history`
- `POST /api/admin/tariffs`, `PATCH /api/admin/tariffs/:id` (Admin only)

## Alerts, Reports & Admin
- `GET /api/alerts`, `POST /api/alerts/:id/acknowledge`, `POST /api/alerts/rules`, `PATCH /api/alerts/rules/:id`
- `GET /api/reports/csv?deviceId=...&type=...`, `GET /api/reports/pdf?deviceId=...&type=...`
- `GET /api/admin/users`, `GET /api/admin/devices`, `POST /api/admin/devices/:id/assign`, `GET /api/admin/status`, `GET /api/admin/alerts`
