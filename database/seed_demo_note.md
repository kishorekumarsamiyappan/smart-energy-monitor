# Demo Mode Data Isolation Policy

Demo Mode is strictly client/memory-sandboxed and uses `isDemo: true` identifiers (`DEMO-SEM-001`, `DEMO-SEM-002`).
Do **NOT** insert simulated demo telemetry into production PostgreSQL `telemetry` or `energy_counters` tables.
This guarantees real ESP32-S3 meter measurements, lifetime kWh accumulators, and TNEB billing records remain uncorrupted.
