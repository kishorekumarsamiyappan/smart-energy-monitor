'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, PlayCircle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, enterDemoMode, cloudConfigured } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 600, color: 'var(--sem-secondary)' }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting} style={{ width: '100%', padding: '12px' }}>
              {submitting ? 'Signing in...' : 'Login'}
            </button>
          </form>

          <hr className="sem-dashed-divider" style={{ margin: '20px 0' }} />

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
