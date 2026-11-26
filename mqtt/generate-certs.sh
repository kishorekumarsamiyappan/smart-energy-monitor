#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

echo "Generating local CA and EMQX TLS server certificates (development/staging)..."
openssl genrsa -out "$CERT_DIR/ca.key" 4096
openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha256 -days 1825 \
  -subj "/CN=SmartEnergyMonitor-Local-CA" -out "$CERT_DIR/ca.crt"

openssl genrsa -out "$CERT_DIR/server.key" 2048
openssl req -new -key "$CERT_DIR/server.key" \
  -subj "/CN=emqx.smartenergymonitor.local" -out "$CERT_DIR/server.csr"

cat > "$CERT_DIR/server.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
DNS.2 = emqx
DNS.3 = emqx.smartenergymonitor.local
IP.1 = 127.0.0.1
EOF

openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.crt" -days 825 -sha256 -extfile "$CERT_DIR/server.ext"

echo "Certificates generated in $CERT_DIR"
echo "Embed ca.crt into firmware/mqtt_client/ca_cert.pem before flashing ESP32-S3."
