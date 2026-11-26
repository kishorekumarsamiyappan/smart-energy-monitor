# Smart Energy Monitor — System Architecture

## 1. Platform Overview
Smart Energy Monitor is a unified full-stack IoT platform for single-phase AC (230 V, 50 Hz, up to 30 A) domestic monitoring and Tamil Nadu (TNEB / TNPDCL LT-IA) bi-monthly electricity bill estimation.

```
[ZMPT101B + SCT-013 30A/1V]
           │ (Signal Conditioned Differential)
           ▼
   [ADS131M02 24-bit ADC] ──(SPI + DRDY)──▶ [ESP32-S3 Firmware]
                                               │        ▲
                          BLE Provisioning ◀───┘        │ MQTT over TLS (8883)
                          (Flutter Android)             ▼
                                               [EMQX MQTT Broker]
                                                        │
                                                        ▼
[Next.js Web App] ◀──(HTTPS REST)──▶ [Node.js / TS Backend] ◀──▶ [Supabase / PostgreSQL + RLS]
[Flutter Android] ◀──(HTTPS REST)──┘           │
                                       [TNEB LT-IA Billing Engine]
```

## 2. Shared Domain Logic (`packages/shared`)
- `billing-engine.ts`: Single authoritative TypeScript billing engine used by Backend and Web, mirrored identically in `mobile/lib/core/billing/tneb_billing_engine.dart`.
- `energy-math.ts`: Telemetry physical range validation, stale detection (> 120s), min/max/avg/peak aggregation, and rollover-safe span accumulation.
- `demo-data.ts`: Completely isolated Demo Mode dataset (`isDemo: true`, `DEMO-SEM-001`, `DEMO-SEM-002`) never persisted into production telemetry tables.

## 3. UI/UX Design Language
- Primary Indigo `#29378F`, Secondary `#4054B2`, Light Lavender `#E9EAF8`, Background `#FFFFFF`, Text `#273238`, Divider `#AAB2B5`, Warning `#F58220`, Success `#1B9E4B`, Error `#D93025`.
- Full Light & Dark mode support across Web and Flutter Android.
- Responsive Desktop Sidebar / Mobile Bottom Navigation, tilted rounded-square `+` FAB, AVR-inspired Device Cards with semi-circular arc gauge, Min/Max crosshair charts with range scrubber sliders, divided Device Settings menu, and overlapping circular avatar Profile card.
