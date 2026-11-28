'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Edit3,
  FileText,
  Lock,
  LogOut,
  Mail,
  Moon,
  Phone,
  PlayCircle,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function ProfilePage() {
  const router = useRouter();
  const { user, token, isDemoMode, isLoading, logout, enterDemoMode, exitDemoMode, updateProfileLocal } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [mobile, setMobile] = useState('');
  const [modalDoc, setModalDoc] = useState<'privacy' | 'terms' | 'password' | null>(null);
  const [currPwd, setCurrPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setOrganization(user.organization ?? '');
      setMobile(user.mobileNumber);
    }
  }, [user]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (isDemoMode || !token) {
      updateProfileLocal({ fullName, organization, mobileNumber: mobile });
      setEditing(false);
      setStatusMsg('Profile updated in Demo Mode.');
      return;
    }
    const res = await apiRequest<{ user: NonNullable<typeof user> }>('/auth/profile', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ fullName, organization, mobileNumber: mobile }),
    });
    updateProfileLocal(res.user);
    setEditing(false);
    setStatusMsg('Profile updated.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (isDemoMode || !token) {
      setStatusMsg('Password changes are disabled in Demo Mode.');
      return;
    }
    await apiRequest('/auth/change-password', {
      method: 'POST',
      token,
      body: JSON.stringify({ currentPassword: currPwd, newPassword: newPwd }),
    });
    setModalDoc(null);
    setCurrPwd('');
    setNewPwd('');
    setStatusMsg('Password updated successfully.');
  };

  return (
    <AppShell>
      {/* Header matching AVR Profile screenshot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard" aria-label="Back to dashboard" style={{ color: 'var(--sem-primary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Profile</h1>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', paddingTop: 20 }}>
        {/* Lavender Card with Overlapping Circular Indigo Avatar Badge matching Screenshot 3 */}
        <div
          className="sem-lavender-card"
          style={{ position: 'relative', padding: '52px 24px 22px', marginBottom: 16 }}
        >
          <div
            style={{
              position: 'absolute',
              top: -34,
              left: 20,
              width: 82,
              height: 82,
              borderRadius: '50%',
              background: 'linear-gradient(145deg, #4054B2, #29378F)',
              border: '5px solid var(--sem-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(41,55,143,0.2)',
            }}
          >
            <User size={40} />
          </div>

          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label="Edit profile"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'none',
              border: 'none',
              color: 'var(--sem-primary)',
              cursor: 'pointer',
            }}
          >
            <Edit3 size={22} />
          </button>

          {editing ? (
            <form onSubmit={handleSaveProfile} style={{ display: 'grid', gap: 10 }}>
              <input className="sem-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Full Name" />
              <input className="sem-input" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organization / Residence" />
              <input className="sem-input" value={mobile} onChange={(e) => setMobile(e.target.value)} required placeholder="Mobile Number" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="sem-btn sem-btn-primary">Save</button>
                <button type="button" className="sem-btn sem-btn-outline" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                {user?.fullName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--sem-muted)', marginBottom: 16 }}>
                ( {user?.role === 'admin' ? 'Admin' : isDemoMode ? 'Demo User' : 'User'} )
              </div>

              <div style={{ display: 'grid', gap: 11, fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Building2 size={18} color="var(--sem-secondary)" />
                  <span>{user?.organization || 'Smart Energy Residence'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Mail size={18} color="var(--sem-secondary)" />
                  <span>{user?.email}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Phone size={18} color="var(--sem-secondary)" />
                  <span>{user?.mobileNumber}</span>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, fontWeight: 700, color: 'var(--sem-primary)' }}>
                App : V1.0.0 (100)
              </div>
            </>
          )}
        </div>

        {statusMsg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(27,158,75,0.12)', color: 'var(--sem-success)', fontSize: 13, fontWeight: 600 }}>
            {statusMsg}
          </div>
        )}

        {/* Action Pill Cards matching Screenshot 3 */}
        <div style={{ display: 'grid', gap: 12 }}>
          <button
            type="button"
            className="sem-lavender-card"
            onClick={toggleTheme}
            style={{ border: 'none', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--sem-text)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
              {theme === 'dark' ? <Sun size={20} color="var(--sem-secondary)" /> : <Moon size={20} color="var(--sem-secondary)" />}
              Theme Mode ({theme === 'dark' ? 'Dark' : 'Light'})
            </span>
            <ChevronRight size={20} color="var(--sem-primary)" />
          </button>

          {isDemoMode && (
            <button
              type="button"
              className="sem-lavender-card"
              onClick={() => {
                exitDemoMode();
                router.push('/login');
              }}
              style={{ border: 'none', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--sem-text)' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
                <PlayCircle size={20} color="#F58220" />
                Exit Demo Mode
              </span>
              <ChevronRight size={20} color="var(--sem-primary)" />
            </button>
          )}

          <button
            type="button"
            className="sem-lavender-card"
            onClick={() => setModalDoc('password')}
            style={{ border: 'none', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--sem-text)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
              <Lock size={20} color="var(--sem-secondary)" />
              Change Password
            </span>
            <ChevronRight size={20} color="var(--sem-primary)" />
          </button>

          <button
            type="button"
            className="sem-lavender-card"
            onClick={() => setModalDoc('privacy')}
            style={{ border: 'none', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--sem-text)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
              <ShieldCheck size={20} color="var(--sem-secondary)" />
              Privacy Policy
            </span>
            <ChevronRight size={20} color="var(--sem-primary)" />
          </button>

          <button
            type="button"
            className="sem-lavender-card"
            onClick={() => setModalDoc('terms')}
            style={{ border: 'none', padding: '15px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--sem-text)' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 600 }}>
              <FileText size={20} color="var(--sem-secondary)" />
              Terms &amp; Condition
            </span>
            <ChevronRight size={20} color="var(--sem-primary)" />
          </button>
        </div>

        {/* Centered Outlined Log out Button matching Screenshot 3 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 26 }}>
          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ minWidth: 220, padding: '12px 24px', fontSize: 16 }}
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
          >
            <LogOut size={18} /> Log out
          </button>
        </div>

        {modalDoc && (
          <div className="sem-card" style={{ marginTop: 18, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>
                {modalDoc === 'privacy'
                  ? 'Privacy Policy'
                  : modalDoc === 'terms'
                    ? 'Terms & Conditions'
                    : 'Change Password'}
              </strong>
              <button type="button" className="sem-btn sem-btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setModalDoc(null)}>
                Close
              </button>
            </div>
            {modalDoc === 'privacy' && (
              <p style={{ fontSize: 13, color: 'var(--sem-muted)', lineHeight: 1.55 }}>
                Your device telemetry, meter readings, and account credentials are isolated with PostgreSQL Row Level Security. Wi-Fi passwords and MQTT device secrets are stored only on your ESP32 NVS / hashed on the server and are never exposed in logs.
              </p>
            )}
            {modalDoc === 'terms' && (
              <p style={{ fontSize: 13, color: 'var(--sem-muted)', lineHeight: 1.55 }}>
                Smart Energy Monitor provides real-time advisory energy monitoring and indicative TNEB LT-IA billing estimates. It is not a certified revenue meter or protective electrical relay, and qualified electrical review is required before mains installation.
              </p>
            )}
            {modalDoc === 'password' && (
              <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 10 }}>
                <input type="password" className="sem-input" placeholder="Current password" value={currPwd} onChange={(e) => setCurrPwd(e.target.value)} required />
                <input type="password" className="sem-input" placeholder="New password (min 8 chars)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
                <button type="submit" className="sem-btn sem-btn-primary">Update Password</button>
              </form>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
