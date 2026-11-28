'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowLeft, Calendar, Check, Cpu, Gauge, RefreshCw, Zap } from 'lucide-react';
import { formatKolkataDateTime, isTelemetryStale } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

export default function MonitoringPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const { devices, selectedDeviceId, setSelectedDeviceId, latestByDevice, historyByDevice, loadDeviceHistory } = useData();

  const [selectedDatePreset, setSelectedDatePreset] = useState<'today' | 'yesterday' | '7d'>('today');
  const [showMinMax, setShowMinMax] = useState(true);
  const [chartMode, setChartMode] = useState<'vi' | 'power' | 'pf_freq'>('vi');

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  const activeDevice = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];
  const latest = activeDevice ? latestByDevice[activeDevice.deviceId] : null;
  const points = activeDevice ? historyByDevice[activeDevice.deviceId] ?? [] : [];

  useEffect(() => {
    if (!activeDevice) return;
    const days = selectedDatePreset === '7d' ? 7 : 1;
    void loadDeviceHistory(activeDevice.deviceId, days);
  }, [activeDevice, loadDeviceHistory, selectedDatePreset]);

  const chartSeries = useMemo(() => {
    if (chartMode === 'vi') {
      return [
        {
          key: 'voltage',
          label: 'Voltage',
          unit: 'V',
          color: '#F58220',
          data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.voltageRms })),
        },
        {
          key: 'current',
          label: 'Current',
          unit: 'A',
          color: '#1B9E4B',
          data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.currentRms })),
        },
      ];
    }
    if (chartMode === 'power') {
      return [
        {
          key: 'active_power',
          label: 'Active Power',
          unit: 'W',
          color: '#F58220',
          data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.activePowerW })),
        },
        {
          key: 'apparent_power',
          label: 'Apparent Power',
          unit: 'VA',
          color: 'var(--sem-primary)',
          data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.apparentPowerVa })),
        },
      ];
    }
    return [
      {
        key: 'pf',
        label: 'Power Factor',
        unit: 'PF',
        color: '#1B9E4B',
        data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.powerFactor })),
      },
      {
        key: 'freq',
        label: 'Frequency',
        unit: 'Hz',
        color: 'var(--sem-secondary)',
        data: points.map((p) => ({ timestamp: p.deviceTimestamp, value: p.frequencyHz })),
      },
    ];
  }, [chartMode, points]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const stale = isTelemetryStale(latest?.ingestedAt ?? activeDevice?.lastSeenAt);

  return (
    <AppShell>
      {/* Top Back + Device Title Bar matching AVR Solar & Battery Log */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" aria-label="Back to dashboard" style={{ color: 'var(--sem-primary)' }}>
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>Electrical Monitoring</h1>
            <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
              {activeDevice ? `${activeDevice.name} / ${activeDevice.deviceId}` : 'No device selected'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {devices.length > 1 && (
            <select
              aria-label="Select monitored device"
              className="sem-input"
              style={{ width: 'auto', minWidth: 180, maxWidth: '100%' }}
              value={activeDevice?.deviceId ?? ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name} ({d.deviceId})
                </option>
              ))}
            </select>
          )}
          <StatusBadge
            tone={activeDevice?.isOnline && !stale ? 'success' : stale ? 'warning' : 'error'}
            label={activeDevice?.isOnline && !stale ? 'Live Connected' : stale ? 'Stale Data' : 'Offline'}
          />
        </div>
      </div>

      {/* 3-Column Summary Strip matching AVR top strip */}
      <div className="sem-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 12, textAlign: 'center' }}>
          <div>
            <Zap size={26} color="var(--sem-secondary)" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Line Voltage</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sem-primary)' }}>
              {latest ? `${latest.voltageRms.toFixed(1)} V` : '--'}
            </div>
          </div>
          <div>
            <Gauge size={26} color="var(--sem-secondary)" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Power Quality</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sem-success)' }}>
              {latest ? `${latest.powerFactor.toFixed(2)} PF` : '--'}
            </div>
          </div>
          <div>
            <Activity size={26} color="var(--sem-secondary)" style={{ marginBottom: 4 }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>Active Load</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sem-warning)' }}>
              {latest ? `${(latest.activePowerW / 1000).toFixed(2)} kW` : '--'}
            </div>
          </div>
        </div>

        <hr className="sem-dashed-divider" style={{ margin: '16px 0' }} />

        {/* Individual Measurement Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12 }}>
          {[
            { label: 'Voltage (RMS)', value: latest ? `${latest.voltageRms.toFixed(1)} V` : '--' },
            { label: 'Current (RMS)', value: latest ? `${latest.currentRms.toFixed(2)} A` : '--' },
            { label: 'Active Power', value: latest ? `${latest.activePowerW.toFixed(0)} W` : '--' },
            { label: 'Apparent Power', value: latest ? `${latest.apparentPowerVa.toFixed(0)} VA` : '--' },
            { label: 'Power Factor', value: latest ? latest.powerFactor.toFixed(3) : '--' },
            { label: 'Frequency', value: latest ? `${latest.frequencyHz.toFixed(2)} Hz` : '--' },
            { label: 'Cumulative Energy', value: latest ? `${latest.energyKwh.toFixed(3)} kWh` : '--' },
            {
              label: 'Last Update (IST)',
              value: latest?.ingestedAt ? formatKolkataDateTime(latest.ingestedAt) : 'No packets yet',
            },
          ].map((m) => (
            <div
              key={m.label}
              className="sem-lavender-card"
              style={{ padding: '10px 12px', borderRadius: 12 }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sem-muted)' }}>{m.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, color: 'var(--sem-text)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating-label Date Control + Min/Max Toggle + Chart matching AVR log screen */}
      <div className="sem-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="sem-floating-group" style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sem-floating-label">Select Date</span>
            <select
              aria-label="Select monitoring date window"
              value={selectedDatePreset}
              onChange={(e) => setSelectedDatePreset(e.target.value as 'today' | 'yesterday' | '7d')}
              style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, color: 'var(--sem-text)', width: '100%', outline: 'none' }}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
            </select>
            <Calendar size={20} color="var(--sem-primary)" />
          </div>

          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ borderRadius: '50%', width: 44, height: 44, padding: 0 }}
            onClick={() => activeDevice && void loadDeviceHistory(activeDevice.deviceId, selectedDatePreset === '7d' ? 7 : 1)}
            aria-label="Refresh chart"
          >
            <RefreshCw size={18} />
          </button>

          <select
            aria-label="Chart signal pair"
            className="sem-input"
            style={{ width: 'auto' }}
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as 'vi' | 'power' | 'pf_freq')}
          >
            <option value="vi">Voltage &amp; Current</option>
            <option value="power">Active &amp; Apparent Power</option>
            <option value="pf_freq">Power Factor &amp; Frequency</option>
          </select>

          <button
            type="button"
            onClick={() => setShowMinMax((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--sem-text)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: showMinMax ? 'var(--sem-primary)' : 'var(--sem-border)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showMinMax && <Check size={14} />}
            </span>
            Min / Max
          </button>
        </div>

        <TelemetryChart series={chartSeries} showMinMax={showMinMax} />

        {activeDevice && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Link href={`/devices/${activeDevice.deviceId}/settings`} className="sem-btn sem-btn-outline" style={{ fontSize: 13 }}>
              <Cpu size={15} /> Hardware &amp; Calibration Settings
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
