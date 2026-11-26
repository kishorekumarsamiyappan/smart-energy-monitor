-- ==============================================================================
-- EMQX Cloud Serverless Rule Engine SQL & Webhook Action Template
-- Connect EMQX Cloud Serverless directly to Cloudflare Workers (`POST /api/webhooks/emqx`)
-- Free Quota Fit: 1M free session-min/mo + 1M free rule executions/mo + 1GB/mo traffic
-- ==============================================================================

-- Rule 1: Route ESP32 Telemetry, Status (LWT/FOTA/Relays), and Alerts to Worker
-- Topic Filter: energy/+/telemetry, energy/+/status, energy/+/alerts

SELECT
  topic,
  clientid,
  username,
  timestamp AS ts,
  payload
FROM
  "energy/+/telemetry",
  "energy/+/status",
  "energy/+/alerts"

-- Action Type: HTTP Server (Webhook)
-- Method: POST
-- URL: https://<your-worker>.workers.dev/api/webhooks/emqx
-- Headers:
--   Content-Type: application/json
--   x-emqx-webhook-secret: ${EMQX_WEBHOOK_SECRET}
-- Body Template:
-- {
--   "topic": "${topic}",
--   "clientid": "${clientid}",
--   "username": "${username}",
--   "ts": ${ts},
--   "payload": ${payload}
-- }
