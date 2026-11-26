'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sem-surface)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }} className="sem-card">
        <div style={{ padding: 24 }}>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--sem-primary)', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            <ArrowLeft size={16} /> Back to Login
          </Link>
          <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Forgot Password</h1>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sem-muted)' }}>
            Enter your registered email address to receive password reset instructions.
          </p>
          {error && <div style={{ color: 'var(--sem-error)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {status && <div style={{ color: 'var(--sem-success)', fontSize: 13, marginBottom: 12 }}>{status}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input type="email" required className="sem-input" style={{ paddingLeft: 36 }} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
