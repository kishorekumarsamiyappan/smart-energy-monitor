import { UserRole } from '@sem/shared';

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  EMQX_WEBHOOK_SECRET: string;
  EMQX_API_URL?: string;
  EMQX_APP_ID?: string;
  EMQX_APP_SECRET?: string;
  GITHUB_FIRMWARE_REPO?: string;
  GITHUB_TOKEN?: string;
  CORS_ORIGINS?: string;
  TELEMETRY_RETENTION_DAYS?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  jti: string;
}
