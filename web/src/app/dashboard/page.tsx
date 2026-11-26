'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  DownloadCloud,
  History,
  Plus,
  Power,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ToggleRight,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  calculateTnebBill,
  formatKolkataDate,
  formatKolkataTime,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
  isTelemetryStale,
} from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { PowerGaugeArc, StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const {
    devices,
    latestByDevice,
    billingCycles,
    activeTariff,
    relaysByDevice,
    firmwareByDevice,
    ioConfigByDevice,
    toggleRelay,
    refreshAll,
    setSelectedDeviceId,
  } = useData();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) {
      router.replace('/login');
    }
  }, [isDemoMode, isLoading, router, user]);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.deviceId.toLowerCase().includes(q) ||
        (d.locationLabel ?? '').toLowerCase().includes(q),
    );
  }, [devices, search]);

  if (isLoading || (!user && !isDemoMode)) {
    return null;
  }

  return (
    <AppShell>
      {/* Search Bar matching AVR Home Screen */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={18}
            color="#29378F"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="search"
            className="sem-input"
            style={{ paddingLeft: 42, borderRadius: 12 }}
            placeholder="Search devices by name, ID, or panel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search devices"
          />
        </div>
        <button
          type="button"
          className="sem-btn sem-btn-outline"
          onClick={() => void refreshAll()}
          title="Refresh telemetry"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {filteredDevices.length === 0 ? (
        <div className="sem-card" style={{ padding: 28, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>No Energy Monitors Connected Yet</h2>
          <p style={{ color: 'var(--sem-muted)', maxWidth: 500, margin: '8px auto 18px' }}>
            Pair your ESP32-S3 meter device or enable Demo Mode from Profile/Login to explore simulated single-phase monitoring and TNEB billing.
          </p>
          <Link href="/devices/add" className="sem-btn sem-btn-primary">
            <Plus size={18} /> Add Your First Device
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
          {filteredDevices.map((dev) => {
            const latest = latestByDevice[dev.deviceId];
            const stale = isTelemetryStale(latest?.ingestedAt ?? dev.lastSeenAt);
            const activeOnline = dev.isOnline && !stale;

            const matchingCycle = billingCycles.find(
              (c) => c.deviceId === dev.deviceId && c.status === 'open',
            );
            const prevRead = matchingCycle?.previousReading ?? 0;
            const currRead = latest?.energyKwh ?? matchingCycle?.currentReading ?? prevRead;
            const billSummary = calculateTnebBill({
              deviceId: dev.deviceId,
              serviceCategory: 'LT-IA',
              consumerEligible: dev.consumerEligibleForSubsidy,
              previousReading: prevRead,
              currentReading: Math.max(prevRead, currRead),
              previousReadingDate: matchingCycle?.periodStart ?? '2026-10-01',
              currentReadingDate: matchingCycle?.periodEnd ?? '2026-11-25',
              readingSource: 'automatic_esp32',
              tariffVersion: activeTariff ?? INDICATIVE_2026_TNEB_LT1A_TARIFF,
            });
            const cycleProgress = Math.min(100, Math.round((billSummary.unitsConsumed / 500) * 100));
            const deviceRelays = relaysByDevice[dev.deviceId] ?? [];
            const primaryRelay = deviceRelays[0];
            const primarySchedule = primaryRelay?.schedules.find((s) => s.enabled) ?? primaryRelay?.schedules[0];
            const fwInfo = firmwareByDevice[dev.deviceId];
            const ioCfg = ioConfigByDevice[dev.deviceId];

            return (
              <div
                key={dev.deviceId}
                className="sem-card"
                style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {/* Device Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {dev.name}{' '}
                      <span style={{ fontWeight: 500, color: 'var(--sem-muted)', fontSize: 13 }}>
                        ({dev.deviceId})
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 3 }}>
                      Last update:{' '}
                      {latest?.ingestedAt || dev.lastSeenAt
                        ? formatKolkataTime(latest?.ingestedAt ?? dev.lastSeenAt!)
                        : 'Never'}
                      {stale && ' • STALE DATA'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {dev.wifiRssiDbm != null && (
                      <span
                        title={`Wi-Fi RSSI: ${dev.wifiRssiDbm} dBm`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sem-primary)', fontWeight: 700 }}
                      >
                        {activeOnline ? <Wifi size={16} /> : <WifiOff size={16} color="#D93025" />}
                        {dev.wifiRssiDbm} dBm
                      </span>
                    )}
                    <StatusBadge
                      tone={activeOnline ? 'success' : stale ? 'warning' : 'error'}
                      label={activeOnline ? 'ONLINE' : stale ? 'STALE / OFFLINE' : 'OFFLINE'}
                    />
                  </div>
                </div>

                {/* FOTA / Offline Buffer Status Row */}
                {(fwInfo?.updateAvailable || (ioCfg?.offlineBufferedCount ?? 0) > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {fwInfo?.updateAvailable && fwInfo.latestRelease && (
                      <Link
                        href={`/devices/${dev.deviceId}/settings`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          background: 'rgba(64, 84, 178, 0.14)',
                          color: 'var(--sem-primary)',
                        }}
                      >
                        <DownloadCloud size={13} />
                        Update v{fwInfo.latestRelease.version} Ready
                      </Link>
                    )}
                    {(ioCfg?.offlineBufferedCount ?? 0) > 0 && (
                      <StatusBadge
                        tone="warning"
                        label={`${ioCfg?.offlineBufferedCount} Buffered Offline`}
                      />
                    )}
                  </div>
                )}

                <hr className="sem-dashed-divider" style={{ margin: '2px 0' }} />

                {/* 2-Column Live Electrical Measurements */}
                {!latest ? (
                  <div style={{ padding: '14px 0', color: 'var(--sem-muted)', fontSize: 13 }}>
                    Waiting for live ESP32-S3 telemetry packets...
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sem-muted)' }}>Voltage / Freq</div>
                      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
                        {latest.voltageRms.toFixed(1)} V{' '}
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sem-secondary)' }}>
                          / {latest.frequencyHz.toFixed(2)} Hz
                        </span>
                      </div>
                    </div>

                    <PowerGaugeArc value={latest.activePowerW} max={7000} unit="W" label="Active Power" />

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sem-muted)' }}>
                        Current ({latest.powerFactor.toFixed(2)} PF)
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
                        {latest.currentRms.toFixed(2)} A{' '}
                        <span style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 500 }}>
                          ({latest.apparentPowerVa.toFixed(0)} VA)
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sem-muted)' }}>Cumulative Energy</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--sem-primary)', marginTop: 2 }}>
                        {latest.energyKwh.toFixed(2)} kWh
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Relay & Offline Schedule Quick Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: 'var(--sem-lavender)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                      Relay CH1: {primaryRelay?.name ?? 'Main Load'} ({deviceRelays.length} ch)
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--sem-muted)' }}>
                      {primarySchedule
                        ? `Offline schedule: ${primarySchedule.startTimeIst}–${primarySchedule.stopTimeIst} IST`
                        : 'No active schedule • NVS offline-ready'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {primaryRelay && (
                      <button
                        type="button"
                        className={primaryRelay.currentState ? 'sem-btn sem-btn-primary' : 'sem-btn sem-btn-outline'}
                        style={{ padding: '5px 11px', fontSize: 12 }}
                        onClick={() => void toggleRelay(dev.deviceId, primaryRelay.id, !primaryRelay.currentState)}
                      >
                        <Power size={13} />
                        {primaryRelay.currentState ? 'ON' : 'OFF'}
                      </button>
                    )}
                    <Link
                      href={`/devices/${dev.deviceId}/relays`}
                      onClick={() => setSelectedDeviceId(dev.deviceId)}
                      className="sem-btn sem-btn-outline"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                    >
                      Relays
                    </Link>
                  </div>
                </div>

                {/* Dashed Box at Bottom of Card — Billing Summary matching AVR Manual Mode box */}
                <div
                  style={{
                    border: '1.5px dashed var(--sem-divider)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    background: 'var(--sem-surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      TNEB LT-IA Billing Cycle ({formatKolkataDate(matchingCycle?.periodStart ?? '2026-10-01')} – {formatKolkataDate(matchingCycle?.periodEnd ?? '2026-11-25')})
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--sem-primary)' }}>
                      ₹{billSummary.totalEstimatedAmountInr.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--sem-muted)', marginBottom: 6 }}>
                    <span>Prev: {billSummary.previousReading.toFixed(1)} kWh</span>
                    <span>Curr: {billSummary.currentReading.toFixed(1)} kWh</span>
                    <span style={{ fontWeight: 700, color: 'var(--sem-text)' }}>
                      {billSummary.unitsConsumed.toFixed(1)} Units
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--sem-border)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${cycleProgress}%`,
                        height: '100%',
                        background: billSummary.unitsConsumed > 500 ? '#D93025' : '#4054B2',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', marginTop: 4 }}>
                    Estimate only (indicative tariff). Free units: {billSummary.freeUnitsApplied}
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                  <Link
                    href={`/monitoring?deviceId=${dev.deviceId}`}
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className="sem-btn sem-btn-primary"
                    style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                  >
                    <Activity size={15} /> Monitor
                  </Link>
                  <Link
                    href={`/history?deviceId=${dev.deviceId}`}
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className="sem-btn sem-btn-outline"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                  >
                    <History size={15} /> History
                  </Link>
                  <Link
                    href="/billing"
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className="sem-btn sem-btn-outline"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                  >
                    <Receipt size={15} /> Bill
                  </Link>
                  <Link
                    href={`/devices/${dev.deviceId}/relays`}
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className="sem-btn sem-btn-outline"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                  >
                    <ToggleRight size={15} /> Relays
                  </Link>
                  <Link
                    href={`/devices/${dev.deviceId}/settings`}
                    onClick={() => setSelectedDeviceId(dev.deviceId)}
                    className="sem-btn sem-btn-outline"
                    style={{ padding: '8px 10px' }}
                    aria-label={`Settings for ${dev.name}`}
                  >
                    <Settings size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Tilted Indigo + Button matching AVR Home Screen */}
      <Link href="/devices/add" className="sem-fab" aria-label="Add new energy device">
        <Plus size={26} />
      </Link>
    </AppShell>
  );
}
