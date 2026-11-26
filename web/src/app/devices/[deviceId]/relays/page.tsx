'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { RESERVED_ESP32_GPIOS } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUGGESTED_SAFE_GPIOS = [4, 5, 6, 7, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42];

export default function DeviceRelaysPage() {
  const params = useParams<{ deviceId: string }>();
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const {
    devices,
    relaysByDevice,
    toggleRelay,
    addRelay,
    deleteRelay,
    addRelaySchedule,
    toggleRelaySchedule,
    deleteRelaySchedule,
  } = useData();

  const deviceId = decodeURIComponent(params?.deviceId ?? '');
  const device = devices.find((d) => d.deviceId === deviceId) || devices[0];
  const relays = device ? relaysByDevice[device.deviceId] ?? [] : [];

  const [newRelayName, setNewRelayName] = useState('');
  const [newRelayGpio, setNewRelayGpio] = useState('5');
  const [newRelayActiveHigh, setNewRelayActiveHigh] = useState(true);
  const [newRelayFailSafe, setNewRelayFailSafe] = useState(false);

  const [scheduleRelayId, setScheduleRelayId] = useState<string | null>(null);
  const [schedLabel, setSchedLabel] = useState('Morning Timer');
  const [schedStart, setSchedStart] = useState('06:00');
  const [schedStop, setSchedStop] = useState('07:30');
  const [schedDays, setSchedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) {
      router.replace('/login');
    }
  }, [isDemoMode, isLoading, router, user]);

  useEffect(() => {
    if (relays.length > 0 && !scheduleRelayId) {
      setScheduleRelayId(relays[0].id);
    }
  }, [relays, scheduleRelayId]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const handleAddRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    setFeedback(null);

    const gpioPin = Number(newRelayGpio);
    if (!Number.isInteger(gpioPin) || gpioPin < 1 || gpioPin > 48) {
      setFeedback({ tone: 'error', text: 'GPIO pin must be an integer between 1 and 48.' });
      return;
    }
    if (RESERVED_ESP32_GPIOS.has(gpioPin)) {
      setFeedback({
        tone: 'error',
        text: `GPIO ${gpioPin} is reserved for ADS131M02 SPI, USB, or Flash. Choose an available pin (${SUGGESTED_SAFE_GPIOS.join(', ')}).`,
      });
      return;
    }
    if (relays.some((r) => r.gpioPin === gpioPin)) {
      setFeedback({ tone: 'error', text: `GPIO ${gpioPin} is already assigned to another relay on this device.` });
      return;
    }

    try {
      await addRelay(device.deviceId, {
        name: newRelayName.trim(),
        gpioPin,
        activeHigh: newRelayActiveHigh,
        failSafeState: newRelayFailSafe,
      });
      setNewRelayName('');
      const nextSafe = SUGGESTED_SAFE_GPIOS.find(
        (pin) => pin !== gpioPin && !relays.some((r) => r.gpioPin === pin),
      );
      if (nextSafe) setNewRelayGpio(String(nextSafe));
      setFeedback({ tone: 'success', text: 'New relay channel added and synced to device NVS.' });
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Unable to add relay' });
    }
  };

  const handleAddSchedule = async (e: React.FormEvent, targetRelayId: string) => {
    e.preventDefault();
    if (!device) return;
    setFeedback(null);

    if (schedDays.length === 0) {
      setFeedback({ tone: 'error', text: 'Select at least one day of the week for the offline schedule.' });
      return;
    }

    try {
      await addRelaySchedule(device.deviceId, targetRelayId, {
        label: schedLabel.trim() || 'Scheduled Load',
        startTimeIst: schedStart,
        stopTimeIst: schedStop,
        daysOfWeek: schedDays,
        enabled: true,
      });
      setFeedback({
        tone: 'success',
        text: 'Offline schedule saved and pushed to ESP32-S3 NVS (runs even without Wi-Fi).',
      });
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Unable to save schedule' });
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" aria-label="Back to dashboard" style={{ color: 'var(--sem-primary)' }}>
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Relays &amp; Offline Schedules</h1>
            <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
              {device ? `${device.name} (${device.deviceId})` : deviceId} • Primary Relay CH1 + Expandable Channels
            </div>
          </div>
        </div>
        {device && (
          <Link href={`/devices/${device.deviceId}/settings`} className="sem-btn sem-btn-outline" style={{ fontSize: 13 }}>
            Device Settings
          </Link>
        )}
      </div>

      {/* Offline RTC + Safety Notices */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="sem-lavender-card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <WifiOff size={18} color="#29378F" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5 }}>
            <strong>Offline Schedule Continuity:</strong> All relay schedules (Asia/Kolkata IST) are mirrored into ESP32-S3 NVS flash. Relays keep switching accurately on the internal RTC even if Wi-Fi or cloud MQTT disconnects.
          </div>
        </div>
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            border: '1px solid rgba(245,130,32,0.35)',
            background: 'rgba(245,130,32,0.08)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={18} color="#F58220" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5 }}>
            <strong>Electrical Safety Notice:</strong> Relay channels control loads through an isolated relay/contactor stage. They do not replace MCBs, RCCBs, or certified electrical protection devices.
          </div>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            background: feedback.tone === 'success' ? 'rgba(27, 158, 75, 0.12)' : 'rgba(217, 48, 37, 0.12)',
            color: feedback.tone === 'success' ? 'var(--sem-success)' : 'var(--sem-error)',
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Active Relay Channels */}
      <div style={{ display: 'grid', gap: 16, marginBottom: 22 }}>
        {relays.map((relay) => (
          <div key={relay.id} className="sem-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: 'var(--sem-primary)',
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 8,
                    }}
                  >
                    CH{relay.channelIndex}
                  </span>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{relay.name}</h2>
                  {relay.channelIndex === 1 && (
                    <StatusBadge tone="info" label="CONFIRMED DEFAULT RELAY" />
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 4 }}>
                  GPIO {relay.gpioPin} • {relay.activeHigh ? 'Active High' : 'Active Low'} • Boot fail-safe:{' '}
                  {relay.failSafeState ? 'ON' : 'OFF'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge
                  tone={relay.currentState ? 'success' : 'neutral'}
                  label={relay.currentState ? 'RELAY ON' : 'RELAY OFF'}
                />
                <button
                  type="button"
                  aria-label={`Toggle ${relay.name}`}
                  className={relay.currentState ? 'sem-btn sem-btn-primary' : 'sem-btn sem-btn-outline'}
                  style={{ padding: '8px 14px', fontSize: 13 }}
                  onClick={() => device && void toggleRelay(device.deviceId, relay.id, !relay.currentState)}
                >
                  <Power size={15} />
                  {relay.currentState ? 'Turn OFF' : 'Turn ON'}
                </button>
                {relay.channelIndex > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${relay.name}`}
                    className="sem-btn sem-btn-outline"
                    style={{ padding: '8px 10px', color: 'var(--sem-error)', borderColor: 'var(--sem-error)' }}
                    onClick={() => {
                      if (device) void deleteRelay(device.deviceId, relay.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            <hr className="sem-dashed-divider" />

            {/* Offline Schedules for this relay */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700 }}>
                <CalendarClock size={16} color="#4054B2" />
                Offline RTC Schedules ({relay.schedules.length})
              </div>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                style={{ padding: '5px 10px', fontSize: 12 }}
                onClick={() => setScheduleRelayId(scheduleRelayId === relay.id ? null : relay.id)}
              >
                <Plus size={14} /> {scheduleRelayId === relay.id ? 'Hide Form' : 'Add Schedule'}
              </button>
            </div>

            {relay.schedules.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--sem-muted)', padding: '6px 0' }}>
                No schedules configured yet for CH{relay.channelIndex}.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                {relay.schedules.map((sched) => (
                  <div
                    key={sched.id}
                    className="sem-lavender-card"
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{sched.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--sem-muted)' }}>
                        {sched.startTimeIst} – {sched.stopTimeIst} IST •{' '}
                        {sched.daysOfWeek.length === 7
                          ? 'Every day'
                          : sched.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="sem-btn sem-btn-outline"
                        style={{ padding: '5px 10px', fontSize: 12 }}
                        onClick={() =>
                          device && void toggleRelaySchedule(device.deviceId, relay.id, sched.id, !sched.enabled)
                        }
                      >
                        <CheckCircle2 size={14} color={sched.enabled ? '#1B9E4B' : '#AAB2B5'} />
                        {sched.enabled ? 'Enabled' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete schedule ${sched.label}`}
                        className="sem-btn sem-btn-outline"
                        style={{ padding: '5px 8px', color: 'var(--sem-error)', borderColor: 'var(--sem-error)' }}
                        onClick={() => device && void deleteRelaySchedule(device.deviceId, relay.id, sched.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {scheduleRelayId === relay.id && (
              <form
                onSubmit={(e) => void handleAddSchedule(e, relay.id)}
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px dashed var(--sem-divider)',
                  background: 'var(--sem-surface)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>New Offline Schedule for CH{relay.channelIndex} ({relay.name})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Label</label>
                    <input
                      className="sem-input"
                      value={schedLabel}
                      onChange={(e) => setSchedLabel(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Start Time (IST)</label>
                    <input
                      type="time"
                      className="sem-input"
                      value={schedStart}
                      onChange={(e) => setSchedStart(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Stop Time (IST)</label>
                    <input
                      type="time"
                      className="sem-input"
                      value={schedStop}
                      onChange={(e) => setSchedStop(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, marginRight: 4 }}>Days:</span>
                  {DAY_LABELS.map((day, idx) => {
                    const active = schedDays.includes(idx);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setSchedDays((prev) =>
                            prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort(),
                          )
                        }
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          border: '1px solid var(--sem-divider)',
                          background: active ? 'var(--sem-primary)' : 'transparent',
                          color: active ? '#FFFFFF' : 'var(--sem-text)',
                          cursor: 'pointer',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <button type="submit" className="sem-btn sem-btn-primary" style={{ fontSize: 13 }}>
                    <Plus size={15} /> Save Offline Schedule
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>

      {/* Add Additional Relay (CH2 - CH8) */}
      <div className="sem-card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} color="#29378F" /> Add Expansion Relay Channel (CH2–CH8)
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--sem-muted)', marginTop: 4 }}>
          Channel 1 (Main Contactor) is confirmed by default. Add extra GPIO relays for geyser, AC, or water pump scheduling. Reserved SPI/Flash pins ({Array.from(RESERVED_ESP32_GPIOS).join(', ')}) are blocked automatically.
        </p>

        <form onSubmit={(e) => void handleAddRelay(e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
          <div>
            <label htmlFor="new-relay-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              Relay Name
            </label>
            <input
              id="new-relay-name"
              className="sem-input"
              placeholder="e.g. Geyser Relay"
              value={newRelayName}
              onChange={(e) => setNewRelayName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="new-relay-gpio" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              ESP32-S3 GPIO Pin
            </label>
            <input
              id="new-relay-gpio"
              type="number"
              min={1}
              max={48}
              className="sem-input"
              value={newRelayGpio}
              onChange={(e) => setNewRelayGpio(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, fontSize: 12.5 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newRelayActiveHigh}
                onChange={(e) => setNewRelayActiveHigh(e.target.checked)}
              />
              Active High Trigger
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newRelayFailSafe}
                onChange={(e) => setNewRelayFailSafe(e.target.checked)}
              />
              Fail-Safe ON after Power Reset
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="sem-btn sem-btn-primary" style={{ width: '100%' }}>
              <Plus size={16} /> Add New Relay
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
