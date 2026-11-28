'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, PlayCircle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, enterDemoMode, cloudConfigured, startGoogleAuth, sendEmailOtp, verifyEmailOtp } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Please enter your email or mobile number and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOtpNotice(null);
    if (!otpEmail.trim()) {
      setError('Enter your registered email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await sendEmailOtp(otpEmail.trim());
      setOtpToken(res.otpToken);
      setOtpNotice(res.message);
      setPreviewOtp(res.previewOtp ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyEmailOtp(otpEmail.trim(), otpCode.trim(), otpToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--sem-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        className="sem-card"
        style={{
          maxWidth: 440,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: '#29378F',
            color: '#FFFFFF',
            padding: '24px 24px 22px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <BrandLogo variant="light" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Welcome Back</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.85 }}>
            Sign in to monitor your ESP32-S3 energy meters &amp; TNEB bills
          </p>
        </div>

        <div style={{ padding: 24 }}>
          {!cloudConfigured && (
            <div
              style={{
                background: 'var(--sem-lavender)',
                color: 'var(--sem-primary)',
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 12,
                marginBottom: 16,
                lineHeight: 1.45,
              }}
            >
              <strong>Cloud Config Notice:</strong> Supabase public environment variables are not configured in <code>.env.local</code>. Connect your backend API or explore the isolated <strong>Demo Mode</strong> below.
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                background: 'rgba(217, 48, 37, 0.12)',
                color: 'var(--sem-error)',
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {!otpMode ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="identifier" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Email or Mobile Number
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={17}
                    color="var(--sem-secondary)"
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    id="identifier"
                    type="text"
                    className="sem-input"
                    style={{ paddingLeft: 38 }}
                    placeholder="you@example.com or 9876543210"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={17}
                    color="var(--sem-secondary)"
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="sem-input"
                    style={{ paddingLeft: 38, paddingRight: 42 }}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--sem-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setOtpMode(true);
                    setError(null);
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--sem-secondary)' }}
                >
                  Sign in with Email OTP
                </button>
                <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 600, color: 'var(--sem-secondary)' }}>
                  Forgot password?
                </Link>
              </div>

              <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting} style={{ width: '100%', padding: '12px' }}>
                {submitting ? 'Signing in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={otpToken ? handleVerifyOtp : handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="otpEmail" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Email Address for OTP
                </label>
                <input
                  id="otpEmail"
                  type="email"
                  className="sem-input"
                  placeholder="you@example.com"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  required
                />
              </div>
              {otpNotice && (
                <div style={{ background: 'var(--sem-lavender)', color: 'var(--sem-primary)', padding: '10px 12px', borderRadius: 10, fontSize: 12.5 }}>
                  {otpNotice}
                  {previewOtp && (
                    <div style={{ marginTop: 4, fontWeight: 800 }}>Preview OTP: {previewOtp}</div>
                  )}
                </div>
              )}
              {otpToken && (
                <div>
                  <label htmlFor="otpCodeInput" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    6-Digit OTP Code
                  </label>
                  <input
                    id="otpCodeInput"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="sem-input"
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                  />
                </div>
              )}
              <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting} style={{ width: '100%', padding: '12px' }}>
                {submitting ? 'Please wait...' : otpToken ? 'Verify OTP & Sign In' : 'Send Verification OTP'}
              </button>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                onClick={() => {
                  setOtpMode(false);
                  setOtpToken(null);
                  setError(null);
                }}
              >
                Back to Password Login
              </button>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <hr className="sem-solid-divider" style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 600 }}>OR</span>
            <hr className="sem-solid-divider" style={{ flex: 1 }} />
          </div>

          <button
            type="button"
            className="sem-btn sem-btn-outline"
            onClick={startGoogleAuth}
            style={{ width: '100%', padding: '11px 14px', marginBottom: 10, color: 'var(--sem-text)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.31h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.27-2.09 3.56-5.17 3.56-8.67Z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3.01c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.1Z" />
              <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1C6.23 6.86 8.88 4.75 12 4.75Z" />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ width: '100%', borderColor: '#F58220', color: '#F58220' }}
            onClick={() => {
              enterDemoMode();
              router.push('/dashboard');
            }}
          >
            <PlayCircle size={18} />
            Try Interactive Demo Mode
          </button>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--sem-muted)', marginTop: 18, marginBottom: 0 }}>
            New user?{' '}
            <Link href="/register" style={{ color: 'var(--sem-primary)', fontWeight: 700 }}>
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
