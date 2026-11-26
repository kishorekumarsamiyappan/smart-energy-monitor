import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export interface BackendEnv {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  supabaseServiceRoleKey: string | null;
  jwtSecret: string;
  mqttEnabled: boolean;
  mqttBrokerUrl: string | null;
  mqttUsername: string | null;
  mqttPassword: string | null;
  mqttClientId: string;
  mqttCaCertPath: string | null;
  mqttRejectUnauthorized: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  authRateLimitMax: number;
  githubFirmwareRepo: string | null;
  githubToken: string | null;
}

export function loadEnv(): BackendEnv {
  const jwtSecret =
    process.env.SUPABASE_JWT_SECRET &&
    !process.env.SUPABASE_JWT_SECRET.includes('your-supabase-jwt-secret')
      ? process.env.SUPABASE_JWT_SECRET
      : process.env.NODE_ENV === 'production'
        ? ''
        : 'dev-only-ephemeral-jwt-secret-change-in-prod';

  if (process.env.NODE_ENV === 'production' && !jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET must be set in production.');
  }

  const dbUrl =
    process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('your-password')
      ? process.env.DATABASE_URL
      : null;

  const sbUrl =
    process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project-ref')
      ? process.env.SUPABASE_URL
      : null;

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 4000),
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    databaseUrl: dbUrl,
    supabaseUrl: sbUrl,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    jwtSecret,
    mqttEnabled: process.env.MQTT_ENABLED === 'true',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || null,
    mqttUsername: process.env.MQTT_USERNAME || null,
    mqttPassword: process.env.MQTT_PASSWORD || null,
    mqttClientId: process.env.MQTT_CLIENT_ID || 'sem-backend-ingestor',
    mqttCaCertPath: process.env.MQTT_CA_CERT_PATH || null,
    mqttRejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== 'false',
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    githubFirmwareRepo: process.env.GITHUB_FIRMWARE_REPO || null,
    githubToken: process.env.GITHUB_TOKEN || null,
  };
}
