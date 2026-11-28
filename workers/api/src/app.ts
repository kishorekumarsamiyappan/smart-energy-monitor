import {
  alertRuleSchema,
  billingCalculateRequestSchema,
  calculateTnebBill,
  createDeviceSchema,
  createRelaySchema,
  deviceIoConfigSchema,
  formatKolkataDateTime,
  loginSchema,
  manualReadingInputSchema,
  mqttTelemetryPayloadSchema,
  OtaJobStatus,
  registerSchema,
  relayScheduleSchema,
  triggerOtaSchema,
  updateDeviceSchema,
  updateRelaySchema,
  validateTelemetryValues,
} from '@sem/shared';
import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { z, ZodError } from 'zod';
import { sha256Hex, signJwt, timingSafeEqualStr, verifyJwt } from './crypto';
import { parseEmqxWebhookBody, publishToEmqxRestApi } from './emqx';
import { buildLightweightPdf } from './pdf';
import { WorkerHttpError, WorkerStore } from './store';
import { AuthUser, WorkerEnv } from './types';

type HonoEnv = {
  Bindings: WorkerEnv;
  Variables: {
    user: AuthUser;
  };
};

const p = (c: Context<HonoEnv>, key: string) => c.req.param(key) ?? '';

export function createWorkerApp(getStore: (env: WorkerEnv) => WorkerStore) {
  const app = new Hono<HonoEnv>();

  app.use('/api/*', async (c, next) => {
    const originsRaw = c.env.CORS_ORIGINS ?? '*';
    const middleware = cors({
      origin: originsRaw === '*' ? '*' : originsRaw.split(',').map((s) => s.trim()),
      credentials: true,
    });
    return middleware(c, next);
  });

  app.onError((err, c) => {
    if (err instanceof WorkerHttpError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json({ error: err.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR', issues: err.errors }, 400);
    }
    return c.json({ error: err instanceof Error ? err.message : 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  });

  // --- Health & EMQX Connector Probe ---
  app.get('/', (c) => {
    return c.json({ status: 'ok', service: 'smart-energy-monitor-worker-api' });
  });

  app.get('/api/health', (c) => {
    const store = getStore(c.env);
    return c.json({
      status: 'ok',
      runtime: 'cloudflare-workers',
      service: 'smart-energy-monitor-worker-api',
      database: store.engine,
      mqttMode: 'emqx-webhook+rest-v5',
      configured: {
        supabase: Boolean(c.env.SUPABASE_URL && c.env.SUPABASE_SERVICE_ROLE_KEY),
        jwtSecret: Boolean(c.env.JWT_SECRET),
        emqxRestApi: Boolean(c.env.EMQX_API_URL && c.env.EMQX_APP_ID && c.env.EMQX_APP_SECRET),
        emqxWebhookSecret: Boolean(c.env.EMQX_WEBHOOK_SECRET),
      },
      retentionDays: Number(c.env.TELEMETRY_RETENTION_DAYS ?? 30),
      timezone: 'Asia/Kolkata',
      timestampUtc: new Date().toISOString(),
    });
  });

  // --- EMQX Cloud Serverless Webhook Endpoint (Rule Engine HTTP Server Action) ---
  app.get('/api/webhooks/emqx', (c) => {
    return c.json({ status: 'ok', endpoint: '/api/webhooks/emqx', expectedMethod: 'POST' });
  });

  app.post('/api/webhooks/emqx', async (c) => {
    const store = getStore(c.env);
    const headerSecret =
      c.req.header('x-emqx-webhook-secret') ??
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';

    if (!c.env.EMQX_WEBHOOK_SECRET || !timingSafeEqualStr(headerSecret, c.env.EMQX_WEBHOOK_SECRET)) {
      return c.json({ error: 'Unauthorized EMQX webhook secret', code: 'UNAUTHORIZED_WEBHOOK' }, 401);
    }

    const body = (await c.req.json()) as Record<string, unknown>;
    const parsedHook = parseEmqxWebhookBody(body);
    if (!parsedHook.ok) {
      return c.json({ error: parsedHook.error, code: 'INVALID_WEBHOOK_TOPIC' }, parsedHook.status);
    }

    const { deviceCode, channel, payload } = parsedHook.event;

    if (channel === 'telemetry') {
      const schemaRes = mqttTelemetryPayloadSchema.safeParse(payload);
      if (!schemaRes.success) {
        return c.json({ error: 'Invalid telemetry payload', issues: schemaRes.error.errors }, 400);
      }
      const metricsCheck = validateTelemetryValues({
        voltageRms: schemaRes.data.voltage_rms,
        currentRms: schemaRes.data.current_rms,
        activePowerW: schemaRes.data.active_power,
        apparentPowerVa: schemaRes.data.apparent_power,
        powerFactor: schemaRes.data.power_factor,
        frequencyHz: schemaRes.data.frequency,
        energyKwh: schemaRes.data.energy_kwh,
      });
      if (!metricsCheck.valid) {
        return c.json({ accepted: false, error: metricsCheck.reasons.join('; ') }, 422);
      }

      const ingestRes = await store.ingestTelemetry({
        deviceId: deviceCode,
        voltageRms: schemaRes.data.voltage_rms,
        currentRms: schemaRes.data.current_rms,
        activePowerW: schemaRes.data.active_power,
        apparentPowerVa: schemaRes.data.apparent_power,
        powerFactor: schemaRes.data.power_factor,
        frequencyHz: schemaRes.data.frequency,
        energyKwh: schemaRes.data.energy_kwh,
        deviceTimestamp: schemaRes.data.timestamp,
        wifiRssiDbm: schemaRes.data.wifi_rssi,
        seq: schemaRes.data.seq,
        buffered: schemaRes.data.buffered,
      });

      if (ingestRes.inserted && !ingestRes.isHistoricalBackfill && !schemaRes.data.buffered) {
        await store.evaluateAlerts(ingestRes.point, ingestRes.deviceUuid, ingestRes.ownerUserId);
      }

      return c.json({
        accepted: ingestRes.inserted,
        isHistoricalBackfill: ingestRes.isHistoricalBackfill,
        lifetimeKwh: ingestRes.lifetimeKwh,
      });
    }

    if (channel === 'status') {
      const st = String(payload.status ?? '').toLowerCase();
      if (st === 'offline') {
        await store.markDeviceOffline(deviceCode, String(payload.reason ?? 'MQTT_LWT'));
        await store.createDeviceAlert(
          deviceCode,
          'device_offline',
          45,
          `Device ${deviceCode} went offline / possible power cut (~30s MQTT LWT).`,
          'critical',
        );
      }
      const relays = Array.isArray(payload.relays)
        ? payload.relays
            .filter((r): r is { ch?: number; channel_index?: number; state: boolean } => Boolean(r && typeof r === 'object'))
            .map((r) => ({ ch: Number(r.ch ?? r.channel_index), state: Boolean(r.state) }))
            .filter((r) => Number.isFinite(r.ch))
        : undefined;

      await store.updateDeviceStatusFromMqtt(deviceCode, {
        offlineBufferedCount: typeof payload.offline_buffered_count === 'number' ? payload.offline_buffered_count : undefined,
        version: typeof payload.version === 'string' ? payload.version : undefined,
        otaStatus: typeof payload.ota_status === 'string' ? (payload.ota_status as OtaJobStatus) : undefined,
        otaProgress: typeof payload.ota_progress === 'number' ? payload.ota_progress : undefined,
        otaJobId: typeof payload.ota_job_id === 'string' ? payload.ota_job_id : undefined,
        otaError: typeof payload.ota_error === 'string' ? payload.ota_error : undefined,
        relays,
      });
      return c.json({ ok: true });
    }

    if (channel === 'alerts') {
      await store.createDeviceAlert(
        deviceCode,
        'sensor_failure',
        Number(payload.observed ?? 0),
        String(payload.message ?? 'ESP32 hardware alert'),
        'critical',
      );
      return c.json({ ok: true });
    }

    return c.json({ ok: true });
  });

  // --- Auth Middleware ---
  const requireAuth = async (c: Context<HonoEnv>, next: () => Promise<void>) => {
    const auth = c.req.header('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required.', code: 'UNAUTHORIZED' }, 401);
    }
    const token = auth.slice(7).trim();
    const decoded = await verifyJwt<{ sub: string; email: string; role: AuthUser['role']; jti: string }>(token, c.env.JWT_SECRET);
    if (!decoded || !decoded.sub) {
      return c.json({ error: 'Invalid or expired token.', code: 'UNAUTHORIZED' }, 401);
    }
    const store = getStore(c.env);
    if (decoded.jti && (await store.isTokenRevoked(decoded.jti))) {
      return c.json({ error: 'Session revoked.', code: 'TOKEN_REVOKED' }, 401);
    }
    c.set('user', { id: decoded.sub, email: decoded.email, role: decoded.role, jti: decoded.jti });
    await next();
  };

  const requireAdmin = async (c: Context<HonoEnv>, next: () => Promise<void>) => {
    if (c.get('user')?.role !== 'admin') {
      return c.json({ error: 'Administrator access required.', code: 'FORBIDDEN' }, 403);
    }
    await next();
  };

  const isAllowedRedirectTarget = (raw: string | undefined | null): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed === 'sem://auth-callback' || trimmed.startsWith('sem://auth-callback?')) {
      return trimmed;
    }
    try {
      const u = new URL(trimmed);
      const isLocal = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      const isHttps = u.protocol === 'https:';
      if ((isHttps || isLocal) && u.pathname === '/auth/callback') {
        return u.toString();
      }
    } catch {
      return null;
    }
    return null;
  };

  const issueEmailOtpChallenge = async (env: WorkerEnv, email: string, fullName?: string) => {
    const emailNorm = email.trim().toLowerCase();
    const rnd = new Uint32Array(1);
    crypto.getRandomValues(rnd);
    const code = String(100000 + (rnd[0] % 900000));
    const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const otpHash = await sha256Hex(`${emailNorm}:${code}:${nonce}`);
    const otpToken = await signJwt(
      { purpose: 'email_otp', email: emailNorm, nonce, otpHash },
      env.JWT_SECRET,
      600,
    );

    let deliveryMethod: 'email' | 'preview' = 'preview';
    if (env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL || 'SEM Smart Energy Monitor <onboarding@resend.dev>',
          to: [emailNorm],
          subject: 'Your SEM Verification Code (OTP)',
          html: `<div style="font-family:sans-serif;max-width:460px;margin:auto;padding:24px;border:1px solid #e2e6f0;border-radius:12px;">
            <h2 style="color:#29378F;margin-top:0;">SEM — Verification Code</h2>
            <p>Hi ${fullName || 'there'},</p>
            <p>Use this 6-digit OTP to verify your sign-in:</p>
            <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:#29378F;background:#E9EAF8;padding:12px 18px;border-radius:10px;text-align:center;">${code}</div>
            <p style="font-size:12px;color:#5c6773;margin-top:16px;">Expires in 10 minutes. Ignore if you did not request this login.</p>
          </div>`,
        }),
      });
      if (res.ok) {
        deliveryMethod = 'email';
      }
    }

    return {
      otpToken,
      expiresInSec: 600,
      deliveryMethod,
      message:
        deliveryMethod === 'email'
          ? `Verification OTP sent to ${emailNorm}.`
          : `OTP generated for ${emailNorm} (SMTP/Resend not configured yet; use preview code).`,
      ...(deliveryMethod === 'preview' ? { previewOtp: code } : {}),
    };
  };

  // --- Auth Routes ---
  app.post('/api/auth/register', async (c) => {
    const store = getStore(c.env);
    const parsed = registerSchema.parse(await c.req.json());
    const user = await store.registerUser(parsed);
    const otp = await issueEmailOtpChallenge(c.env, user.email, user.fullName);
    const token = await signJwt({ sub: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() }, c.env.JWT_SECRET);
    return c.json({ user, token, verificationRequired: false, otp, message: 'Account created successfully.' }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const store = getStore(c.env);
    const parsed = loginSchema.parse(await c.req.json());
    const user = await store.verifyUserLogin(parsed.identifier, parsed.password);
    const token = await signJwt({ sub: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() }, c.env.JWT_SECRET);
    return c.json({ user, token });
  });

  app.get('/api/auth/google/start', async (c) => {
    const reqUrl = new URL(c.req.url);
    const target = isAllowedRedirectTarget(c.req.query('redirect_to')) ?? 'sem://auth-callback';
    const modeJson = c.req.query('mode') === 'json';
    const supaUrl = (c.env.SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
    const bridgeCallback = `${reqUrl.origin}/api/auth/google/callback?target=${encodeURIComponent(target)}`;

    if (supaUrl && c.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const settingsRes = await fetch(`${supaUrl}/auth/v1/settings`, {
          headers: { apikey: c.env.SUPABASE_SERVICE_ROLE_KEY },
        });
        if (settingsRes.ok) {
          const settings = (await settingsRes.json()) as { external?: Record<string, boolean> };
          if (settings.external?.google) {
            const authorizeUrl = `${supaUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(bridgeCallback)}`;
            if (modeJson) return c.json({ configured: true, authorizeUrl, callbackUrl: bridgeCallback });
            return c.redirect(authorizeUrl, 302);
          }
        }
      } catch {
        // Fall through to configuration error handling below
      }
    }

    if (modeJson) {
      return c.json(
        {
          configured: false,
          googleClientId: c.env.GOOGLE_CLIENT_ID ?? null,
          callbackUrl: `${reqUrl.origin}/api/auth/google/callback`,
          message:
            'Google OAuth is not enabled in Supabase Auth yet. Enable Google provider in Supabase Dashboard -> Authentication -> Providers.',
        },
        400,
      );
    }
    const sep = target.includes('#') ? '&' : '#';
    return c.redirect(`${target}${sep}error=google_not_configured`, 302);
  });

  app.get('/api/auth/google/callback', (c) => {
    const rawTarget = isAllowedRedirectTarget(c.req.query('target')) ?? 'sem://auth-callback';
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SEM Sign-In</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0F1424;color:#ECEFF4;text-align:center;padding:24px;">
<div>
  <h2 style="margin:0 0 8px;">Completing Google Sign-In...</h2>
  <p style="opacity:0.8;font-size:14px;">Returning you to Smart Energy Monitor...</p>
</div>
<script>
(function(){
  var target = ${JSON.stringify(rawTarget)};
  var hash = window.location.hash || '';
  var q = new URLSearchParams(window.location.search);
  var err = q.get('error') || q.get('error_description');
  if (!hash && err) {
    hash = '#error=' + encodeURIComponent(err);
  }
  window.location.replace(target + hash);
})();
</script></body></html>`;
    return c.html(html);
  });

  app.post('/api/auth/google', async (c) => {
    const store = getStore(c.env);
    const body = z
      .object({
        supabaseAccessToken: z.string().min(10).optional(),
        googleIdToken: z.string().min(10).optional(),
        googleAccessToken: z.string().min(10).optional(),
      })
      .refine((v) => Boolean(v.supabaseAccessToken || v.googleIdToken || v.googleAccessToken), {
        message: 'A verified Google or Supabase OAuth token is required.',
      })
      .parse(await c.req.json());

    let email = '';
    let fullName = '';
    let avatarUrl: string | null = null;
    let authUid: string | null = null;

    if (body.supabaseAccessToken) {
      const supaUrl = (c.env.SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
      const uRes = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${body.supabaseAccessToken}`,
          apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      if (!uRes.ok) {
        return c.json({ error: 'Invalid or expired Supabase Google OAuth token.', code: 'INVALID_OAUTH_TOKEN' }, 401);
      }
      const uData = (await uRes.json()) as {
        id?: string;
        email?: string;
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
      };
      email = uData.email ?? '';
      fullName = uData.user_metadata?.full_name || uData.user_metadata?.name || '';
      avatarUrl = uData.user_metadata?.avatar_url || uData.user_metadata?.picture || null;
      authUid = uData.id ?? null;
    } else if (body.googleIdToken) {
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.googleIdToken)}`);
      if (!infoRes.ok) {
        return c.json({ error: 'Invalid Google ID token.', code: 'INVALID_OAUTH_TOKEN' }, 401);
      }
      const info = (await infoRes.json()) as {
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        picture?: string;
        sub?: string;
        aud?: string;
      };
      if (c.env.GOOGLE_CLIENT_ID && info.aud !== c.env.GOOGLE_CLIENT_ID) {
        return c.json({ error: 'Google token audience mismatch.', code: 'INVALID_OAUTH_AUDIENCE' }, 401);
      }
      if (info.email_verified !== true && info.email_verified !== 'true') {
        return c.json({ error: 'Google account email is not verified.', code: 'UNVERIFIED_EMAIL' }, 403);
      }
      email = info.email ?? '';
      fullName = info.name ?? '';
      avatarUrl = info.picture ?? null;
      authUid = info.sub ?? null;
    } else if (body.googleAccessToken) {
      const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${body.googleAccessToken}` },
      });
      if (!uiRes.ok) {
        return c.json({ error: 'Invalid Google access token.', code: 'INVALID_OAUTH_TOKEN' }, 401);
      }
      const info = (await uiRes.json()) as {
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
        sub?: string;
      };
      if (!info.email_verified) {
        return c.json({ error: 'Google account email is not verified.', code: 'UNVERIFIED_EMAIL' }, 403);
      }
      email = info.email ?? '';
      fullName = info.name ?? '';
      avatarUrl = info.picture ?? null;
      authUid = info.sub ?? null;
    }

    if (!email) {
      return c.json({ error: 'Google account did not return an email address.', code: 'MISSING_EMAIL' }, 400);
    }

    const user = await store.upsertGoogleUser({
      email,
      fullName: fullName || email.split('@')[0],
      avatarUrl,
      authUid,
    });
    const otp = await issueEmailOtpChallenge(c.env, user.email, user.fullName);
    return c.json({ user, otpRequired: true, ...otp });
  });

  app.post('/api/auth/otp/send', async (c) => {
    const body = z
      .object({
        email: z.string().trim().email(),
        fullName: z.string().trim().max(120).optional(),
      })
      .parse(await c.req.json());
    const challenge = await issueEmailOtpChallenge(c.env, body.email, body.fullName);
    return c.json(challenge);
  });

  app.post('/api/auth/otp/verify', async (c) => {
    const body = z
      .object({
        email: z.string().trim().email(),
        code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification OTP'),
        otpToken: z.string().min(10),
      })
      .parse(await c.req.json());

    const emailNorm = body.email.toLowerCase();
    const decoded = await verifyJwt<{ purpose?: string; email?: string; nonce?: string; otpHash?: string }>(
      body.otpToken,
      c.env.JWT_SECRET,
    );
    if (!decoded || decoded.purpose !== 'email_otp' || decoded.email !== emailNorm || !decoded.nonce || !decoded.otpHash) {
      return c.json({ error: 'OTP expired or invalid. Please request a new code.', code: 'INVALID_OTP_TOKEN' }, 400);
    }

    const candidateHash = await sha256Hex(`${emailNorm}:${body.code}:${decoded.nonce}`);
    if (!timingSafeEqualStr(candidateHash, decoded.otpHash)) {
      return c.json({ error: 'Incorrect 6-digit OTP code.', code: 'INVALID_OTP_CODE' }, 401);
    }

    const user = await getStore(c.env).markEmailVerified(emailNorm);
    if (!user) {
      return c.json({ error: 'No account found for this email address.', code: 'USER_NOT_FOUND' }, 404);
    }
    const token = await signJwt({ sub: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() }, c.env.JWT_SECRET);
    return c.json({ user, token, verified: true });
  });

  app.post('/api/auth/logout', requireAuth, async (c) => {
    await getStore(c.env).revokeToken(c.get('user').jti);
    return c.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', async (c) => {
    const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());
    const resetToken = await getStore(c.env).createResetToken(email);
    return c.json({
      message: 'If an account matches this email, reset instructions have been issued.',
      ...(resetToken ? { previewResetToken: resetToken } : {}),
    });
  });

  app.post('/api/auth/reset-password', async (c) => {
    const { token, newPassword } = z.object({ token: z.string().min(8), newPassword: z.string().min(8) }).parse(await c.req.json());
    await getStore(c.env).consumeResetToken(token, newPassword);
    return c.json({ message: 'Password updated successfully.' });
  });

  app.post('/api/auth/change-password', requireAuth, async (c) => {
    const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).parse(await c.req.json());
    await getStore(c.env).changeUserPassword(c.get('user').id, body.currentPassword, body.newPassword);
    return c.json({ message: 'Password changed successfully.' });
  });

  app.get('/api/auth/me', requireAuth, async (c) => {
    const user = await getStore(c.env).getUserById(c.get('user').id);
    return c.json({ user });
  });

  app.patch('/api/auth/profile', requireAuth, async (c) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(120).optional(),
        mobileNumber: z.string().trim().regex(/^[+]?[0-9]{10,15}$/).optional(),
        organization: z.string().trim().max(120).nullable().optional(),
        themePreference: z.enum(['light', 'dark', 'system']).optional(),
      })
      .parse(await c.req.json());
    const user = await getStore(c.env).updateUserProfile(c.get('user').id, body);
    return c.json({ user });
  });

  // --- Devices, Telemetry, Relays, I/O LEDs & FOTA ---
  app.get('/api/devices', requireAuth, async (c) => {
    const devices = await getStore(c.env).listDevices(c.get('user').id, c.get('user').role);
    return c.json({ devices });
  });

  app.post('/api/devices', requireAuth, async (c) => {
    const parsed = createDeviceSchema.parse(await c.req.json());
    const created = await getStore(c.env).createDevice(c.get('user').id, parsed);
    return c.json(
      {
        device: created.device,
        oneTimeMqttCredentials: { username: created.mqttUsername, password: created.mqttPassword },
        warning: 'Store MQTT credentials securely on the ESP32-S3 via BLE. They will not be displayed again.',
      },
      201,
    );
  });

  app.get('/api/devices/:id', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const [sensorConfig, latest] = await Promise.all([store.getSensorConfig(dev.uuid, dev.deviceId), store.getLatestTelemetry(dev.uuid)]);
    return c.json({ device: { ...dev, id: dev.uuid }, sensorConfig, latest });
  });

  app.patch('/api/devices/:id', requireAuth, async (c) => {
    const store = getStore(c.env);
    const raw = await c.req.json();
    const base = updateDeviceSchema.parse(raw);
    const extra = z
      .object({
        sensorConfig: z
          .object({
            voltageCalibrationFactor: z.number().positive().max(10).optional(),
            currentCalibrationFactor: z.number().positive().max(10).optional(),
            phaseCorrectionDeg: z.number().min(-30).max(30).optional(),
            calibrationStatus: z.enum(['verified', 'pending', 'factory_default', 'recalibration_due']).optional(),
          })
          .optional(),
      })
      .parse(raw);

    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const updated = await store.updateDevice(dev.uuid, c.get('user').id, c.get('user').role, { ...base, ...extra });
    if (base.telemetryIntervalSec !== undefined || extra.sensorConfig) {
      await publishToEmqxRestApi(
        c.env,
        `energy/${updated.deviceId}/config`,
        {
          telemetry_interval_sec: updated.telemetryIntervalSec,
          ...(extra.sensorConfig ? { calibration: extra.sensorConfig } : {}),
          updated_at: new Date().toISOString(),
        },
        { qos: 1, retain: true },
      );
    }
    return c.json({ device: updated });
  });

  app.delete('/api/devices/:id', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    await store.deleteDevice(dev.uuid);
    return c.json({ ok: true });
  });

  app.get('/api/devices/:id/latest', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const [latest, sensorConfig] = await Promise.all([store.getLatestTelemetry(dev.uuid), store.getSensorConfig(dev.uuid, dev.deviceId)]);
    return c.json({ latest, sensorConfig });
  });

  app.get('/api/devices/:id/telemetry', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const data = await store.getTelemetryHistory(dev.uuid, dev.deviceId, {
      days: c.req.query('days') ? Number(c.req.query('days')) : 1,
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
    });
    return c.json(data);
  });

  app.get('/api/devices/:id/history', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const data = await store.getTelemetryHistory(dev.uuid, dev.deviceId, {
      days: c.req.query('days') ? Number(c.req.query('days')) : 1,
      startDate: c.req.query('startDate'),
      endDate: c.req.query('endDate'),
    });
    return c.json(data);
  });

  app.get('/api/devices/:id/energy', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json({ deviceId: dev.deviceId, counter: await store.getEnergyCounter(dev.uuid) });
  });

  app.get('/api/devices/:id/energy/daily', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const days = c.req.query('days') ? Number(c.req.query('days')) : 30;
    return c.json({ deviceId: dev.deviceId, daily: await store.getDailyRollups(dev.uuid, days) });
  });

  app.get('/api/devices/:id/energy/monthly', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json({ deviceId: dev.deviceId, monthly: await store.getMonthlyRollups(dev.uuid) });
  });

  app.get('/api/devices/:id/io-config', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json({ ioConfig: await store.getIoConfig(dev.uuid, dev.deviceId) });
  });

  app.patch('/api/devices/:id/io-config', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const parsed = deviceIoConfigSchema.parse(await c.req.json());
    const ioConfig = await store.updateIoConfig(dev.uuid, dev.deviceId, parsed);
    await publishToEmqxRestApi(
      c.env,
      `energy/${dev.deviceId}/config`,
      {
        led_config: {
          status_mode: ioConfig.statusLedMode,
          rgb_gpio: ioConfig.statusRgbGpio,
          single_gpio: ioConfig.statusSingleLedGpio,
          pulse_enabled: ioConfig.pulseLedEnabled,
          pulse_gpio: ioConfig.pulseLedGpio,
          imp_per_kwh: ioConfig.pulseImpPerKwh,
        },
        offline_buffer_enabled: ioConfig.offlineBufferEnabled,
      },
      { qos: 1, retain: true },
    );
    return c.json({ ioConfig });
  });

  const publishRelaySync = async (store: WorkerStore, env: WorkerEnv, devUuid: string, devCode: string) => {
    const relays = await store.listRelays(devUuid, devCode);
    await publishToEmqxRestApi(
      env,
      `energy/${devCode}/config`,
      {
        relays: relays.map((r) => ({ ch: r.channelIndex, gpio: r.gpioPin, active_high: r.activeHigh, state: r.currentState, fail_safe: r.failSafeState })),
        schedules: relays.flatMap((r) =>
          r.schedules.filter((s) => s.enabled).map((s) => ({ ch: r.channelIndex, start: s.startTimeIst, stop: s.stopTimeIst, days: s.daysOfWeek })),
        ),
      },
      { qos: 1, retain: true },
    );
  };

  app.get('/api/devices/:id/relays', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json({ relays: await store.listRelays(dev.uuid, dev.deviceId) });
  });

  app.post('/api/devices/:id/relays', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const relay = await store.addRelay(dev.uuid, dev.deviceId, createRelaySchema.parse(await c.req.json()));
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ relay }, 201);
  });

  app.patch('/api/devices/:id/relays/:relayId', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const parsed = updateRelaySchema.parse(await c.req.json());
    const relay = await store.updateRelay(dev.uuid, dev.deviceId, p(c, 'relayId'), parsed);
    if (parsed.currentState !== undefined) {
      await publishToEmqxRestApi(
        c.env,
        `energy/${dev.deviceId}/command`,
        { command: 'set_relay', ch: relay.channelIndex, state: relay.currentState },
        { qos: 1 },
      );
    }
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ relay });
  });

  app.delete('/api/devices/:id/relays/:relayId', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    await store.deleteRelay(dev.uuid, p(c, 'relayId'));
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ ok: true });
  });

  app.post('/api/devices/:id/relays/:relayId/schedules', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const schedule = await store.addSchedule(dev.uuid, dev.deviceId, p(c, 'relayId'), relayScheduleSchema.parse(await c.req.json()));
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ schedule }, 201);
  });

  app.patch('/api/devices/:id/relays/:relayId/schedules/:scheduleId', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    await store.updateSchedule(dev.uuid, p(c, 'relayId'), p(c, 'scheduleId'), relayScheduleSchema.partial().parse(await c.req.json()));
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ ok: true });
  });

  app.delete('/api/devices/:id/relays/:relayId/schedules/:scheduleId', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    await store.deleteSchedule(dev.uuid, p(c, 'relayId'), p(c, 'scheduleId'));
    await publishRelaySync(store, c.env, dev.uuid, dev.deviceId);
    return c.json({ ok: true });
  });

  app.get('/api/devices/:id/firmware', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json(await store.getDeviceFirmwareStatus(dev.uuid, dev.firmwareVersion));
  });

  app.post('/api/devices/:id/ota', requireAuth, async (c) => {
    const store = getStore(c.env);
    const dev = await store.resolveAuthorizedDevice(p(c, 'id'), c.get('user').id, c.get('user').role);
    const raw = await c.req.json().catch(() => ({}));
    const parsed = triggerOtaSchema.parse(raw);
    const job = await store.createOtaJob({
      deviceUuid: dev.uuid,
      deviceCode: dev.deviceId,
      userId: c.get('user').id,
      targetVersion: parsed.targetVersion,
      binaryUrl: parsed.binaryUrl,
      checksumSha256: parsed.checksumSha256,
    });
    await publishToEmqxRestApi(
      c.env,
      `energy/${dev.deviceId}/command`,
      { command: 'ota_update', job_id: job.id, version: job.targetVersion, url: job.binaryUrl },
      { qos: 1 },
    );
    return c.json({ job }, 202);
  });

  // --- Firmware Releases (GitHub FOTA) ---
  app.get('/api/firmware/releases', requireAuth, async (c) => {
    return c.json({ releases: await getStore(c.env).listFirmwareReleases() });
  });

  app.post('/api/admin/firmware/sync-github', requireAuth, requireAdmin, async (c) => {
    const { repo } = z.object({ repo: z.string().trim().optional() }).parse(await c.req.json().catch(() => ({})));
    const targetRepo = repo || c.env.GITHUB_FIRMWARE_REPO;
    if (!targetRepo) throw new WorkerHttpError(400, 'No GitHub repo configured', 'GITHUB_REPO_MISSING');
    const ghRes = await fetch(`https://api.github.com/repos/${targetRepo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SmartEnergyMonitor-Worker',
        ...(c.env.GITHUB_TOKEN ? { Authorization: `Bearer ${c.env.GITHUB_TOKEN}` } : {}),
      },
    });
    if (!ghRes.ok) throw new WorkerHttpError(502, `GitHub API HTTP ${ghRes.status}`, 'GITHUB_SYNC_FAILED');
    const rel = (await ghRes.json()) as {
      tag_name?: string;
      body?: string;
      assets?: Array<{ name: string; browser_download_url: string; size?: number }>;
    };
    const binAsset = rel.assets?.find((a) => a.name.endsWith('.bin'));
    if (!binAsset) throw new WorkerHttpError(404, 'No .bin asset found in latest GitHub release.', 'MISSING_BIN_ASSET');
    const saved = await getStore(c.env).registerFirmwareRelease({
      version: (rel.tag_name ?? '1.0.0').replace(/^v/i, ''),
      tagName: rel.tag_name,
      githubRepo: targetRepo,
      binaryUrl: binAsset.browser_download_url,
      releaseNotes: rel.body ?? '',
      fileSizeBytes: binAsset.size ?? null,
    });
    return c.json({ release: saved });
  });

  app.post('/api/admin/firmware/releases', requireAuth, requireAdmin, async (c) => {
    const body = z
      .object({
        version: z.string().trim().min(1).max(40),
        tagName: z.string().trim().max(64).optional(),
        githubRepo: z.string().trim().max(160).nullable().optional(),
        binaryUrl: z.string().url(),
        checksumSha256: z.string().trim().max(64).nullable().optional(),
        releaseNotes: z.string().optional(),
        fileSizeBytes: z.number().int().positive().nullable().optional(),
      })
      .parse(await c.req.json());
    const release = await getStore(c.env).registerFirmwareRelease(body);
    return c.json({ release }, 201);
  });

  // --- Billing & Tariffs ---
  app.get('/api/billing/current', requireAuth, async (c) => {
    const store = getStore(c.env);
    const devices = await store.listDevices(c.get('user').id, c.get('user').role);
    const qDev = c.req.query('deviceId');
    const target = qDev
      ? await store.resolveAuthorizedDevice(qDev, c.get('user').id, c.get('user').role)
      : devices[0]
        ? await store.resolveAuthorizedDevice(devices[0].deviceId, c.get('user').id, c.get('user').role)
        : null;
    if (!target) return c.json({ current: null, message: 'No devices paired yet.' });

    const [counter, history, tariff] = await Promise.all([
      store.getEnergyCounter(target.uuid),
      store.getBillingHistory(c.get('user').id),
      store.getActiveTariff(),
    ]);
    const prevClosed = history.cycles.find((x) => x.deviceId === target.deviceId);
    const prevKwh = prevClosed?.currentReading ?? 0;
    const nowDate = new Date().toISOString().slice(0, 10);
    const current = calculateTnebBill({
      deviceId: target.deviceId,
      serviceCategory: 'LT-IA',
      consumerEligible: target.consumerEligibleForSubsidy,
      previousReading: prevKwh,
      currentReading: Math.max(prevKwh, counter.lifetimeKwh),
      previousReadingDate: prevClosed?.periodEnd ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
      currentReadingDate: nowDate,
      readingSource: 'automatic_esp32',
      tariffVersion: tariff,
      counterResetCount: counter.counterResetCount,
    });
    return c.json({ current, counter, tariff });
  });

  app.post('/api/billing/calculate', requireAuth, async (c) => {
    const store = getStore(c.env);
    const body = billingCalculateRequestSchema.parse(await c.req.json());
    const dev = await store.resolveAuthorizedDevice(body.deviceId, c.get('user').id, c.get('user').role);
    const res = await store.persistBillCalculation({
      userId: c.get('user').id,
      deviceUuid: dev.uuid,
      deviceCode: dev.deviceId,
      previousReading: body.previousReading,
      currentReading: body.currentReading,
      previousReadingDate: body.previousReadingDate,
      currentReadingDate: body.currentReadingDate,
      readingSource: body.readingSource,
      consumerEligible: body.consumerEligible,
      fixedChargesInr: body.fixedChargesInr,
      additionalChargesInr: body.additionalChargesInr,
    });
    return c.json(res, 201);
  });

  app.post('/api/billing/manual-reading', requireAuth, async (c) => {
    const store = getStore(c.env);
    const body = manualReadingInputSchema.parse(await c.req.json());
    const dev = await store.resolveAuthorizedDevice(body.deviceId, c.get('user').id, c.get('user').role);
    const res = await store.submitManualReading({
      userId: c.get('user').id,
      deviceUuid: dev.uuid,
      deviceCode: dev.deviceId,
      consumerEligible: dev.consumerEligibleForSubsidy,
      previousReading: body.previousReading,
      previousReadingDate: body.previousReadingDate,
      currentReading: body.currentReading,
      currentReadingDate: body.currentReadingDate,
      meterSerialNumber: body.meterSerialNumber,
      notes: body.notes,
      preferredSource: body.preferredSource,
    });
    return c.json(res, 201);
  });

  app.get('/api/billing/history', requireAuth, async (c) => {
    return c.json(await getStore(c.env).getBillingHistory(c.get('user').id));
  });

  app.get('/api/billing/:id', requireAuth, async (c) => {
    return c.json({ cycle: await getStore(c.env).getBillingById(c.get('user').id, p(c, 'id')) });
  });

  app.patch('/api/billing/:id/actual', requireAuth, async (c) => {
    const body = z.object({ actualBillAmountInr: z.number().finite().min(0), officialBillNumber: z.string().max(64).optional() }).parse(await c.req.json());
    const cycle = await getStore(c.env).recordActualBill(c.get('user').id, p(c, 'id'), body.actualBillAmountInr, body.officialBillNumber);
    return c.json({ cycle });
  });

  app.get('/api/tariffs/current', requireAuth, async (c) => {
    return c.json({ tariff: await getStore(c.env).getActiveTariff() });
  });

  app.get('/api/tariffs/history', requireAuth, async (c) => {
    return c.json({ tariffs: await getStore(c.env).getAllTariffs() });
  });

  app.post('/api/admin/tariffs', requireAuth, requireAdmin, async (c) => {
    const schema = z.object({
      versionCode: z.string().min(3).max(64),
      category: z.string().default('LT-IA'),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      isIndicative: z.boolean().default(false),
      officialVerified: z.boolean().default(false),
      sourceReference: z.string().min(3),
      subsidyRule: z.object({
        name: z.string().min(3),
        freeUnitsUpto500: z.number().int().min(0),
        freeUnitsAbove500: z.number().int().min(0),
        eligibilityRequired: z.boolean().default(true),
        notes: z.string().default(''),
      }),
      slabs: z
        .array(
          z.object({
            slabOrder: z.number().int().positive(),
            branch: z.enum(['UPTO_500', 'ABOVE_500', 'BASE_NON_SUBSIDY']),
            fromUnit: z.number().min(0),
            toUnit: z.number().positive().nullable(),
            ratePerUnitInr: z.number().min(0),
            fixedChargeInr: z.number().min(0).default(0),
            description: z.string().min(2),
          }),
        )
        .min(1),
    });
    const parsed = schema.parse(await c.req.json());
    const tariff = await getStore(c.env).createTariff(c.get('user').id, { ...parsed, effectiveTo: parsed.effectiveTo ?? null });
    return c.json({ tariff }, 201);
  });

  app.patch('/api/admin/tariffs/:id', requireAuth, requireAdmin, async (c) => {
    const body = z
      .object({ status: z.enum(['draft', 'active', 'archived']).optional(), officialVerified: z.boolean().optional(), isIndicative: z.boolean().optional() })
      .parse(await c.req.json());
    return c.json({ tariff: await getStore(c.env).updateTariffStatus(p(c, 'id'), body) });
  });

  // --- Alerts ---
  app.get('/api/alerts', requireAuth, async (c) => {
    return c.json(await getStore(c.env).listAlerts(c.get('user').id, c.get('user').role));
  });

  app.post('/api/alerts/:id/acknowledge', requireAuth, async (c) => {
    await getStore(c.env).acknowledgeAlert(p(c, 'id'), c.get('user').id, c.get('user').role);
    return c.json({ ok: true });
  });

  app.post('/api/alerts/rules', requireAuth, async (c) => {
    const store = getStore(c.env);
    const parsed = alertRuleSchema.parse(await c.req.json());
    const dev = await store.resolveAuthorizedDevice(parsed.deviceId, c.get('user').id, c.get('user').role);
    const rule = await store.createAlertRule(c.get('user').id, dev.uuid, dev.deviceId, parsed);
    return c.json({ rule }, 201);
  });

  app.patch('/api/alerts/rules/:id', requireAuth, async (c) => {
    const patch = z
      .object({
        thresholdValue: z.number().finite().optional(),
        enabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
      })
      .parse(await c.req.json());
    const rule = await getStore(c.env).updateAlertRule(p(c, 'id'), c.get('user').id, c.get('user').role, patch);
    return c.json({ rule });
  });

  // --- Reports (CSV + <0.5ms CPU PDF 1.4) ---
  app.get('/api/reports/csv', requireAuth, async (c) => {
    const store = getStore(c.env);
    const devices = await store.listDevices(c.get('user').id, c.get('user').role);
    const qDev = c.req.query('deviceId');
    const dev = qDev
      ? await store.resolveAuthorizedDevice(qDev, c.get('user').id, c.get('user').role)
      : devices[0]
        ? await store.resolveAuthorizedDevice(devices[0].deviceId, c.get('user').id, c.get('user').role)
        : null;
    if (!dev) return c.json({ error: 'No device available for export' }, 404);

    const reportType = c.req.query('type') ?? 'electrical_parameters';
    let csv = '';
    if (reportType === 'billing_period') {
      const { cycles } = await store.getBillingHistory(c.get('user').id);
      csv = [
        'Period Start,Period End,Device,Previous (kWh),Current (kWh),Units (kWh),Source,Estimated (INR),Actual (INR),Status',
        ...cycles.map((x) => `${x.periodStart},${x.periodEnd},${x.deviceId},${x.previousReading},${x.currentReading},${x.unitsConsumed},${x.readingSource},${x.estimatedAmountInr.toFixed(2)},${x.actualBillAmountInr?.toFixed(2) ?? ''},${x.status}`),
      ].join('\n');
    } else {
      const { points } = await store.getTelemetryHistory(dev.uuid, dev.deviceId, { days: Number(c.req.query('days') ?? 7) });
      csv = [
        'Timestamp (Asia/Kolkata),Device ID,Voltage (V),Current (A),Active Power (W),Apparent Power (VA),Power Factor,Frequency (Hz),Energy (kWh)',
        ...points.map((p) => `"${formatKolkataDateTime(p.deviceTimestamp)} IST",${p.deviceId},${p.voltageRms},${p.currentRms},${p.activePowerW},${p.apparentPowerVa},${p.powerFactor},${p.frequencyHz},${p.energyKwh}`),
      ].join('\n');
    }

    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sem-${reportType}-${dev.deviceId}.csv"`,
    });
  });

  app.get('/api/reports/pdf', requireAuth, async (c) => {
    const store = getStore(c.env);
    const devices = await store.listDevices(c.get('user').id, c.get('user').role);
    const qDev = c.req.query('deviceId');
    const dev = qDev
      ? await store.resolveAuthorizedDevice(qDev, c.get('user').id, c.get('user').role)
      : devices[0]
        ? await store.resolveAuthorizedDevice(devices[0].deviceId, c.get('user').id, c.get('user').role)
        : null;
    if (!dev) return c.json({ error: 'No device available for export' }, 404);

    const { points, summary } = await store.getTelemetryHistory(dev.uuid, dev.deviceId, { days: Number(c.req.query('days') ?? 7) });
    const lines = [
      `Device: ${dev.name} (${dev.deviceId})  |  Generated: ${formatKolkataDateTime(new Date().toISOString())} IST`,
      `Summary: Samples=${summary.count}, Avg V=${summary.avgVoltage.toFixed(1)}V, Peak=${summary.peakPowerW.toFixed(0)}W, Total=${summary.totalEnergyKwh.toFixed(3)}kWh`,
      '-----------------------------------------------------------------------------------------',
      ...points.slice(-30).map(
        (p) => `${formatKolkataDateTime(p.deviceTimestamp)} IST | ${p.voltageRms.toFixed(1)}V | ${p.currentRms.toFixed(2)}A | ${p.activePowerW.toFixed(0)}W | PF ${p.powerFactor.toFixed(2)} | ${p.energyKwh.toFixed(3)}kWh`,
      ),
      'Notice: TNEB figures are indicative estimates unless verified against an official bill.',
    ];
    const pdfBytes = buildLightweightPdf(lines);
    return new Response(pdfBytes as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sem-report-${dev.deviceId}.pdf"`,
      },
    });
  });

  // --- Admin Routes ---
  app.get('/api/admin/users', requireAuth, requireAdmin, async (c) => {
    return c.json({ users: await getStore(c.env).listAllUsers() });
  });

  app.get('/api/admin/devices', requireAuth, requireAdmin, async (c) => {
    return c.json({ devices: await getStore(c.env).listDevices(c.get('user').id, 'admin') });
  });

  app.post('/api/admin/devices/:id/assign', requireAuth, requireAdmin, async (c) => {
    const { ownerUserId } = z.object({ ownerUserId: z.string().uuid() }).parse(await c.req.json());
    return c.json({ device: await getStore(c.env).assignDeviceOwnership(p(c, 'id'), ownerUserId) });
  });

  app.get('/api/admin/status', requireAuth, requireAdmin, async (c) => {
    const store = getStore(c.env);
    return c.json({
      status: 'healthy',
      runtime: 'cloudflare-workers',
      databaseEngine: store.engine,
      counts: await store.getPlatformStats(),
      timestampUtc: new Date().toISOString(),
    });
  });

  app.get('/api/admin/alerts', requireAuth, requireAdmin, async (c) => {
    return c.json(await getStore(c.env).listAlerts(c.get('user').id, 'admin'));
  });

  app.post('/api/admin/maintenance/prune', requireAuth, requireAdmin, async (c) => {
    const { retentionDays } = z.object({ retentionDays: z.number().int().min(7).max(365).optional() }).parse(await c.req.json().catch(() => ({})));
    const result = await getStore(c.env).pruneOldTelemetry(retentionDays ?? Number(c.env.TELEMETRY_RETENTION_DAYS ?? 30));
    return c.json({ ok: true, ...result });
  });

  return app;
}
