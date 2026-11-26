import { WorkerEnv } from './types';

export interface ParsedEmqxWebhook {
  topic: string;
  deviceCode: string;
  channel: 'telemetry' | 'status' | 'alerts';
  clientId?: string;
  payload: Record<string, unknown>;
}

/**
 * Parses an incoming EMQX Cloud Serverless Rule Engine HTTP Server webhook event.
 * Rejects topic/client spoofing cleanly before database writes.
 */
export function parseEmqxWebhookBody(
  body: Record<string, unknown>,
): { ok: true; event: ParsedEmqxWebhook } | { ok: false; status: 400 | 403; error: string } {
  const topic = String(body.topic ?? '').trim();
  const match = /^energy\/([^/]+)\/(telemetry|status|alerts)$/i.exec(topic);
  if (!match) {
    return { ok: false, status: 400, error: 'Unsupported MQTT topic in EMQX webhook' };
  }

  const deviceCode = match[1].toUpperCase();
  const channel = match[2].toLowerCase() as 'telemetry' | 'status' | 'alerts';
  const clientId = typeof body.clientid === 'string' ? body.clientid.toUpperCase() : undefined;

  if (clientId && !clientId.startsWith('BACKEND') && clientId !== deviceCode) {
    return { ok: false, status: 403, error: 'MQTT clientId does not match topic deviceId' };
  }

  let payload: Record<string, unknown> = {};
  if (typeof body.payload === 'string') {
    try {
      payload = JSON.parse(body.payload) as Record<string, unknown>;
    } catch {
      return { ok: false, status: 400, error: 'Malformed JSON string in webhook payload' };
    }
  } else if (body.payload && typeof body.payload === 'object') {
    payload = body.payload as Record<string, unknown>;
  } else {
    payload = body;
  }

  if (typeof payload.device_id === 'string' && payload.device_id.toUpperCase() !== deviceCode) {
    return { ok: false, status: 403, error: 'Payload device_id does not match MQTT topic' };
  }

  return { ok: true, event: { topic, deviceCode, channel, clientId, payload } };
}

/**
 * Sends downlink configuration/commands to ESP32-S3 via EMQX Cloud Serverless HTTP REST API v5
 * (`POST /api/v5/publish`) so Cloudflare Workers never needs a stateful MQTT TCP socket.
 */
export async function publishToEmqxRestApi(
  env: WorkerEnv,
  topic: string,
  payloadObj: Record<string, unknown>,
  options: { qos?: 0 | 1 | 2; retain?: boolean } = {},
): Promise<{ sent: boolean; status?: number }> {
  if (!env.EMQX_API_URL || !env.EMQX_APP_ID || !env.EMQX_APP_SECRET) {
    return { sent: false };
  }

  const baseUrl = env.EMQX_API_URL.trim().replace(/\/api\/v5\/?$/i, '').replace(/\/$/, '');
  const authHeader = 'Basic ' + btoa(`${env.EMQX_APP_ID}:${env.EMQX_APP_SECRET}`);
  const res = await fetch(`${baseUrl}/api/v5/publish`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      payload: JSON.stringify(payloadObj),
      payload_encoding: 'plain',
      qos: options.qos ?? 1,
      retain: options.retain ?? false,
    }),
  });

  return { sent: res.ok, status: res.status };
}
