'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';

export default function SplashPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      if (user || isDemoMode) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [isDemoMode, isLoading, router, user]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #29378F 0%, #4054B2 100%)',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          padding: 22,
          borderRadius: 24,
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <BrandLogo variant="light" />
      </div>
      <div>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800 }}>Smart Energy Monitor</h1>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
          Single-Phase AC Telemetry &amp; TNEB LT-IA Billing Platform
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Checking authentication session"
        style={{
          width: 180,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '65%',
            height: '100%',
            background: '#F58220',
            borderRadius: 999,
          }}
        />
      </div>
      <span style={{ fontSize: 12, opacity: 0.8 }}>Checking authentication session...</span>
    </div>
  );
}
