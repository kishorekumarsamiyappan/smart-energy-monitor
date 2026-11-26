'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please accept the Terms & Conditions and Privacy Policy.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await register({
        fullName: fullName.trim(),
        email: email.trim(),
        mobileNumber: mobileNumber.trim(),
        password,
        organization: organization.trim() || undefined,
        acceptedTerms: true,
      });
      if (res.verificationRequired) {
        setSuccessMsg(res.message);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sem-surface)', paddingBottom: 40 }}>
      <div style={{ background: '#29378F', color: '#FFFFFF', padding: '20px 24px 44px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/login" style={{ color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <ArrowLeft size={18} /> Back
          </Link>
          <BrandLogo variant="light" compact />
        </div>
        <div style={{ maxWidth: 480, margin: '12px auto 0' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Create Account</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>
            Register to connect your Smart Energy Monitor devices
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '-24px auto 0', padding: '0 16px' }}>
        <div className="sem-card" style={{ padding: 24 }}>
          {error && (
            <div role="alert" style={{ background: 'rgba(217,48,37,0.12)', color: 'var(--sem-error)', padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ background: 'rgba(27,158,75,0.14)', color: 'var(--sem-success)', padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="fullName" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="fullName" className="sem-input" style={{ paddingLeft: 36 }} required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Kishorekumar S" />
              </div>
            </div>

            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="email" type="email" className="sem-input" style={{ paddingLeft: 36 }} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label htmlFor="mobileNumber" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Mobile Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="mobileNumber" type="tel" className="sem-input" style={{ paddingLeft: 36 }} required value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="9876543210" />
              </div>
            </div>

            <div>
              <label htmlFor="organization" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Organization / Home Label (Optional)</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="organization" className="sem-input" style={{ paddingLeft: 36 }} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Residence / Building" />
              </div>
            </div>

            <div>
              <label htmlFor="regPassword" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="regPassword" type={showPassword ? 'text' : 'password'} className="sem-input" style={{ paddingLeft: 36, paddingRight: 40 }} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
                <button type="button" onClick={() => setShowPassword((s) => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--sem-muted)', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#4054B2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input id="confirmPassword" type={showPassword ? 'text' : 'password'} className="sem-input" style={{ paddingLeft: 36 }} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                I accept the Terms &amp; Conditions and Privacy Policy, and understand that Smart Energy Monitor provides advisory monitoring and billing estimates only.
              </span>
            </label>

            <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting} style={{ padding: 12 }}>
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--sem-muted)', marginTop: 16, marginBottom: 0 }}>
            Already registered?{' '}
            <Link href="/login" style={{ color: 'var(--sem-primary)', fontWeight: 700 }}>
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
