'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Edit3, Plus, Settings, ToggleRight, Trash2, Wifi } from 'lucide-react';
import { formatKolkataTime, isTelemetryStale } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

export default function DevicesPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const { devices, latestByDevice, setSelectedDeviceId, renameDevice, removeDevice } = useData();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  if (isLoading || (!user && !isDemoMode)) return null;

  return (
    <AppShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>My Energy Devices</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sem-muted)' }}>
            Manage ESP32-S3 single-phase monitors paired to your account
          </p>
        </div>
        <Link href="/devices/add" className="sem-btn sem-btn-primary">
          <Plus size={17} /> Add Device
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {devices.map((dev) => {
          const latest = latestByDevice[dev.deviceId];
          const stale = isTelemetryStale(latest?.ingestedAt ?? dev.lastSeenAt);
          const online = dev.isOnline && !stale;

          return (
            <div key={dev.deviceId} className="sem-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  {renamingId === dev.deviceId ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <input
                        className="sem-input"
                        style={{ flex: '1 1 180px', minWidth: 0 }}
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        aria-label="New device name"
                      />
                      <button
                        type="button"
                        className="sem-btn sem-btn-primary"
                        onClick={async () => {
                          if (renameText.trim().length >= 2) {
                            await renameDevice(dev.deviceId, renameText.trim());
                            setRenamingId(null);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="sem-btn sem-btn-outline" onClick={() => setRenamingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 17, fontWeight: 700 }}>
                      {dev.name}{' '}
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sem-muted)' }}>({dev.deviceId})</span>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 4 }}>
                    Last seen: {latest?.ingestedAt || dev.lastSeenAt ? formatKolkataTime(latest?.ingestedAt ?? dev.lastSeenAt!) : 'Never'} • Firmware {dev.firmwareVersion}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {dev.wifiRssiDbm != null && (
                    <span style={{ fontSize: 12, color: 'var(--sem-primary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Wifi size={15} /> {dev.wifiRssiDbm} dBm
                    </span>
                  )}
                  <StatusBadge tone={online ? 'success' : 'error'} label={online ? 'Online' : 'Offline'} />
                </div>
              </div>

              <hr className="sem-dashed-divider" />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', fontWeight: 700 }}>Voltage</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{latest ? `${latest.voltageRms.toFixed(1)} V` : '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', fontWeight: 700 }}>Current</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{latest ? `${latest.currentRms.toFixed(2)} A` : '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', fontWeight: 700 }}>Power</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{latest ? `${latest.activePowerW.toFixed(0)} W` : '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', fontWeight: 700 }}>Accumulated kWh</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sem-primary)' }}>
                    {latest ? `${latest.energyKwh.toFixed(2)} kWh` : '--'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Link
                  href={`/monitoring?deviceId=${dev.deviceId}`}
                  onClick={() => setSelectedDeviceId(dev.deviceId)}
                  className="sem-btn sem-btn-primary"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                >
                  <Activity size={14} /> Open Device
                </Link>
                <button
                  type="button"
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                  onClick={() => {
                    setRenamingId(dev.deviceId);
                    setRenameText(dev.name);
                  }}
                >
                  <Edit3 size={14} /> Rename
                </button>
                <Link
                  href={`/devices/${dev.deviceId}/relays`}
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                >
                  <ToggleRight size={14} /> Relays &amp; Schedules
                </Link>
                <Link
                  href={`/devices/${dev.deviceId}/settings`}
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '7px 14px', fontSize: 13 }}
                >
                  <Settings size={14} /> Device Settings
                </Link>
                <button
                  type="button"
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '7px 14px', fontSize: 13, color: 'var(--sem-error)', borderColor: 'var(--sem-error)' }}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Factory Reset & Remove ${dev.name} (${dev.deviceId})? This removes the device from your account so it can be paired again fresh.`,
                      )
                    ) {
                      void removeDevice(dev.deviceId);
                    }
                  }}
                >
                  <Trash2 size={14} /> Factory Reset / Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
