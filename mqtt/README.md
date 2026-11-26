# EMQX MQTT Broker Configuration

- **Protocol**: MQTT over TLS (`mqtts://`, port `8883`, TLS 1.2 / 1.3).
- **Topic Hierarchy**:
  - `energy/{DEVICE_ID}/telemetry` (Device -> Backend, QoS 1)
  - `energy/{DEVICE_ID}/status` (Device -> Backend + LWT offline payload, QoS 1, retained)
  - `energy/{DEVICE_ID}/alerts` (Device -> Backend, QoS 1)
  - `energy/{DEVICE_ID}/config` (Backend -> Device, QoS 1, retained)
  - `energy/{DEVICE_ID}/command` (Backend -> Device, QoS 1)
- **Topic Isolation**: `acl.conf` binds each device `${clientid}` to its own `energy/${clientid}/*` topics only.
- **Certificates**: Run `./generate-certs.sh` for local/Docker TLS testing, or use EMQX Cloud managed TLS CA certificate (`emqxsl-ca.crt`) in production.
