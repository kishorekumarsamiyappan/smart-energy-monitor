'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  Cpu,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  MapPin,
  Moon,
  Receipt,
  ShieldAlert,
  Sun,
  User,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useData } from '@/lib/data-context';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isDemoMode, exitDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { alerts, devices, selectedDeviceId } = useData();

  const activeAlertsCount = alerts.filter((a) => a.status === 'active').length;
  const currentDevice = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/monitoring', label: 'Monitoring', icon: Activity },
    { href: '/history', label: 'History', icon: History },
    { href: '/billing', label: 'EB Billing', icon: Receipt },
    { href: '/manual-reading', label: 'Manual Meter', icon: FileSpreadsheet },
    { href: '/devices', label: 'Devices', icon: Cpu },
    { href: '/alerts', label: 'Alerts', icon: Bell },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  if (user?.role === 'admin') {
    navItems.push({ href: '/admin', label: 'Admin', icon: ShieldAlert });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--sem-bg)' }}>
      {/* Top Indigo Header matching AVR reference */}
      <header
        className="sem-topbar"
        style={{
          backgroundColor: 'var(--sem-header-bg)',
          color: 'var(--sem-header-text)',
          height: 64,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        }}
      >
        <Link href="/dashboard" aria-label="Smart Energy Monitor Home">
          <BrandLogo variant="light" />
        </Link>

        <div className="sem-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isDemoMode && (
            <span
              data-testid="demo-mode-badge"
              style={{
                background: '#F58220',
                color: '#FFFFFF',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '4px 10px',
                borderRadius: 999,
              }}
            >
              DEMO MODE
            </span>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{
              background: 'rgba(255,255,255,0.14)',
              border: 'none',
              color: '#FFFFFF',
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <Link
            href="/alerts"
            aria-label="Notifications"
            style={{
              position: 'relative',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            <Bell size={22} />
            {activeAlertsCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  minWidth: 17,
                  height: 17,
                  borderRadius: '50%',
                  background: '#F58220',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
              >
                {activeAlertsCount}
              </span>
            )}
          </Link>

          <Link
            href="/devices"
            aria-label="Device Locations"
            title={currentDevice ? `${currentDevice.name} (${currentDevice.deviceId})` : 'Devices'}
            style={{
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            <MapPin size={22} />
          </Link>

          <Link
            href="/profile"
            aria-label="Profile"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#FFFFFF',
              color: '#29378F',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {user?.fullName ? user.fullName.charAt(0).toUpperCase() : <User size={18} />}
          </Link>
        </div>
      </header>

      {/* Isolated Demo Mode Notice Banner */}
      {isDemoMode && (
        <div
          style={{
            background: 'rgba(245, 130, 32, 0.14)',
            borderBottom: '1px solid rgba(245, 130, 32, 0.45)',
            padding: '8px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 13,
          }}
        >
          <div>
            <strong>Demo Mode Active:</strong> Displaying simulated single-phase 230V / 50Hz readings &amp; indicative TNEB LT-IA billing. Never treated as real sensor telemetry.
          </div>
          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => {
              exitDemoMode();
              router.push('/login');
            }}
          >
            Exit Demo &amp; Sign In
          </button>
        </div>
      )}

      <div className="sem-shell-grid" style={{ flex: 1 }}>
        {/* Responsive Desktop Sidebar */}
        <aside className="sem-sidebar">
          <nav aria-label="Main Navigation" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 14px',
                    borderRadius: 11,
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    backgroundColor: active ? '#29378F' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--sem-text)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <Icon size={18} color={active ? '#FFFFFF' : 'var(--sem-secondary)'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div
            className="sem-lavender-card"
            style={{ marginTop: 'auto', padding: 14, fontSize: 12, lineHeight: 1.5 }}
          >
            <div style={{ fontWeight: 700, color: 'var(--sem-primary)', marginBottom: 4 }}>
              SEM • ESP32-S3 + ADC1
            </div>
            <div style={{ color: 'var(--sem-muted)' }}>
              ZMPT101B (GPIO 4) • SCT-013-000 (GPIO 5, 22Ω) • 230V 50Hz
            </div>
          </div>
        </aside>

        {/* Main Screen Content */}
        <main className="sem-main-content" style={{ flex: 1, padding: '20px 20px 36px' }}>
          <div className="sem-container">{children}</div>
        </main>
      </div>

      {/* Simple Mobile Bottom Navigation */}
      <nav className="sem-bottom-nav" aria-label="Mobile Navigation">
        {[
          { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
          { href: '/monitoring', label: 'Monitor', icon: Activity },
          { href: '/history', label: 'History', icon: History },
          { href: '/billing', label: 'Billing', icon: Receipt },
          { href: '/devices', label: 'Devices', icon: Cpu },
          { href: '/profile', label: 'Profile', icon: User },
          ...(user?.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: ShieldAlert }] : []),
        ].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--sem-primary)' : 'var(--sem-muted)',
                padding: '6px 8px',
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
