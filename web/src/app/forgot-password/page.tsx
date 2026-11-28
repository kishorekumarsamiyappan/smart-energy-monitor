'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string; previewResetToken?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.previewResetToken) {
        setToken(res.previewResetToken);
        setStep('reset');
        setStatus('Reset token issued. Enter your new password below.');
      } else {
        setStatus('No active account matched that email address, or email check did not return a token.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request password reset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      setStatus(`${res.message} Redirecting to login...`);
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password');
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
      <div style={{ maxWidth: 440, width: '100%' }} className="sem-card">
        <div style={{ padding: 24 }}>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--sem-primary)', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            <ArrowLeft size={16} /> Back to Login
          </Link>
          <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>
            {step === 'request' ? 'Forgot Password' : 'Set New Password'}
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sem-muted)' }}>
            {step === 'request'
              ? 'Enter your registered email address to verify your account and reset your password.'
              : 'Enter a new password (min 8 characters) to finish resetting your account.'}
          </p>
          {error && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(217,48,37,0.1)', color: 'var(--sem-error)', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {status && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(27,158,75,0.12)', color: 'var(--sem-success)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} />
              <span>{status}</span>
            </div>
          )}

          {step === 'request' ? (
            <form onSubmit={handleRequestReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="var(--sem-secondary)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="email"
                  required
                  className="sem-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting}>
                {submitting ? 'Verifying...' : 'Send Reset Link'}
              </button>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                onClick={() => {
                  setError(null);
                  setStatus(null);
                  setStep('reset');
                }}
              >
                Already have a reset token?
              </button>
            </form>
          ) : (
            <form onSubmit={handleApplyReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <KeyRound size={16} color="var(--sem-secondary)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  className="sem-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Reset token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--sem-secondary)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  className="sem-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="New password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <input
                type="password"
                className="sem-input"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting}>
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                onClick={() => {
                  setStep('request');
                  setError(null);
                }}
              >
                Request another token
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
