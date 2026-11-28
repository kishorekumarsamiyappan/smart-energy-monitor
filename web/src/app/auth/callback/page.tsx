'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { UserProfile } from '@sem/shared';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const { exchangeGoogleToken, sendEmailOtp, verifyEmailOtp } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configGuide, setConfigGuide] = useState(false);
  const [googleUser, setGoogleUser] = useState<UserProfile | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const errParam = hashParams.get('error') || queryParams.get('error');
    const accessToken = hashParams.get('access_token');

    if (errParam) {
      if (errParam === 'google_not_configured') {
        setConfigGuide(true);
        setError('Google OAuth provider is not enabled in Supabase Dashboard yet.');
      } else {
        setError(decodeURIComponent(errParam));
      }
      setLoading(false);
      return;
    }

    if (!accessToken) {
      setError('No Google OAuth token was returned. Please try Continue with Google again.');
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await exchangeGoogleToken({ supabaseAccessToken: accessToken });
        setGoogleUser(res.user);
        setOtpToken(res.otpToken);
        setOtpMessage(res.message);
        setPreviewOtp(res.previewOtp ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to complete Google authentication.');
      } finally {
        setLoading(false);
      }
    })();
  }, [exchangeGoogleToken]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleUser || !otpToken) return;
    setError(null);
    setVerifying(true);
    try {
      await verifyEmailOtp(googleUser.email, otpCode.trim(), otpToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid 6-digit OTP.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!googleUser) return;
    setError(null);
    const res = await sendEmailOtp(googleUser.email);
    setOtpToken(res.otpToken);
    setOtpMessage(res.message);
    setPreviewOtp(res.previewOtp ?? null);
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
      <div className="sem-card" style={{ maxWidth: 460, width: '100%', overflow: 'hidden' }}>
        <div style={{ background: '#29378F', color: '#FFFFFF', padding: '22px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <BrandLogo variant="light" />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Google Sign-In &amp; OTP Verification</h1>
        </div>

        <div style={{ padding: 24 }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--sem-muted)' }}>Fetching your Google profile &amp; issuing OTP...</div>}

          {!loading && error && (
            <div style={{ background: 'rgba(217, 48, 37, 0.12)', color: 'var(--sem-error)', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {!loading && configGuide && (
            <div className="sem-lavender-card" style={{ padding: 14, fontSize: 12.5, lineHeight: 1.55, marginBottom: 14 }}>
              <strong>One-Time Supabase Google Setup:</strong>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Open Supabase Dashboard → <strong>Authentication → Providers → Google</strong> and enable it with your Google Client ID &amp; Secret.</li>
                <li>Add Redirect URL: <code>https://smart-energy-monitor-api.smart-energy-monitor.workers.dev/api/auth/google/callback**</code></li>
              </ol>
            </div>
          )}

          {!loading && googleUser && (
            <>
              <div className="sem-lavender-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: '#29378F',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {googleUser.avatarUrl ? (
                    <img
                      src={googleUser.avatarUrl}
                      alt={googleUser.fullName}
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    googleUser.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{googleUser.fullName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--sem-muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Mail size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{googleUser.email}</span>
                  </div>
                </div>
              </div>

              {otpMessage && (
                <div style={{ background: 'rgba(27, 158, 75, 0.12)', color: 'var(--sem-success)', padding: '10px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} /> {otpMessage}
                  </div>
                  {previewOtp && <div style={{ marginTop: 4, fontWeight: 800 }}>OTP Code: {previewOtp}</div>}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label htmlFor="googleOtpInput" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Enter 6-Digit Email OTP
                  </label>
                  <input
                    id="googleOtpInput"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="sem-input"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="6-digit OTP code"
                    required
                  />
                </div>
                <button type="submit" className="sem-btn sem-btn-primary" disabled={verifying} style={{ width: '100%', padding: 12 }}>
                  <ShieldCheck size={17} /> {verifying ? 'Verifying...' : 'Verify OTP & Continue'}
                </button>
                <button type="button" className="sem-btn sem-btn-outline" onClick={() => void handleResend()}>
                  Resend 6-Digit OTP
                </button>
              </form>
            </>
          )}

          {!loading && !googleUser && (
            <Link href="/login" className="sem-btn sem-btn-primary" style={{ width: '100%' }}>
              Back to Login
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
