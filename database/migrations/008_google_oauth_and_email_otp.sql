-- ==============================================================================
-- 008_google_oauth_and_email_otp.sql
-- Support Google OAuth (nullable initial mobile_number, avatar_url) and Email OTP
-- ==============================================================================

ALTER TABLE public.users
  ALTER COLUMN mobile_number DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.auth_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'login',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_email_created ON public.auth_otps(email, created_at DESC);
