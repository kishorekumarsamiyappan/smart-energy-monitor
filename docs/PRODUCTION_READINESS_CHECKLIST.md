# Production Readiness Checklist

## Electrical & Hardware Safety
- [ ] Qualified electrical engineer inspected PCB layout, creepage (≥ 6.4 mm), clearance (≥ 4.0 mm), HRC fuse, and MOV surge protection.
- [ ] Verified ZMPT101B (`GPIO 4`) and SCT-013-000 `100 A / 50 mA` (`GPIO 5`) mid-rail bias and conditioned peak swings stay strictly inside `0–3.3 V` ESP32-S3 ADC1 limits.
- [ ] Confirmed external **22 Ω** burden resistor is securely connected across `SCT-013-000` (`100 A / 50 mA`) terminals before clamping live conductors.
- [ ] Completed `docs/HIL_TEST_PLAN.md` calibration against Class 0.5 reference wattmeter.
- [ ] Verified NVS lifetime `energy_kwh` persistence across abrupt power loss.

## Tariff & Billing Governance
- [ ] Administrator reviewed official TNERC / TNPDCL tariff & subsidy orders for LT-IA and updated `tariff_versions` (`official_verified = TRUE`, `is_indicative = FALSE`).
- [ ] Confirmed all 17 boundary tests (`0..1001` units) pass against active tariff version.
- [ ] Verified billing cycle transition rules for any tariff effective-date crossings.

## Security & Privacy
- [ ] `.env`, service-role keys, and device MQTT passwords excluded from Git and frontend bundles.
- [ ] EMQX MQTT over TLS (`mqtts://:8883`) enabled with per-device ACLs (`mqtt/acl.conf`).
- [ ] PostgreSQL Row Level Security verified on all 19 tables (`npm run test:db`).
- [ ] HTTPS enforced across Web (`Vercel`) and API (`backend`), rate limiting enabled, audit logs active.
- [ ] Verified Demo Mode (`isDemo: true`) remains strictly isolated from production telemetry.
