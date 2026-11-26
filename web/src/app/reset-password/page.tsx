'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
    try {
      const res = await apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), newPassword }),
      });
      setStatus(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sem-surface)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }} className="sem-card">
        <div style={{ padding: 24 }}>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--sem-primary)', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            <ArrowLeft size={16} /> Back to Login
          </Link>
          <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Reset Password</h1>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sem-muted)' }}>
            Enter your reset token and choose a new password.
          </p>
          {error && <div style={{ color: 'var(--sem-error)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {status && <div style={{ color: 'var(--sem-success)', fontSize: 13, marginBottom: 12 }}>{status}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input className="sem-input" placeholder="Reset token" value={token} onChange={(e) => setToken(e.target.value)} required />
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input type="password" className="sem-input" style={{ paddingLeft: 36 }} placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <input type="password" className="sem-input" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <button type="submit" className="sem-btn sem-btn-primary">Update Password</button>
          </form>
        </div>
      </div>
    </div>
  );
}
