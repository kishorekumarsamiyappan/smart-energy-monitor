'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, Plus, ShieldAlert } from 'lucide-react';
import { AlertType, formatKolkataDateTime } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

const ALERT_TYPES: Array<{ value: AlertType; label: string; defaultThreshold: number; op: 'gt' | 'lt' | 'outside_range' }> = [
  { value: 'high_current', label: 'High Current (A)', defaultThreshold: 22, op: 'gt' },
  { value: 'overcurrent_warning', label: 'Overcurrent Warning (A)', defaultThreshold: 28, op: 'gt' },
  { value: 'high_power', label: 'High Power (W)', defaultThreshold: 3500, op: 'gt' },
  { value: 'abnormal_voltage', label: 'Abnormal Voltage (V)', defaultThreshold: 205, op: 'outside_range' },
  { value: 'low_power_factor', label: 'Low Power Factor', defaultThreshold: 0.75, op: 'lt' },
  { value: 'device_offline', label: 'Device Offline (sec)', defaultThreshold: 120, op: 'gt' },
  { value: 'sensor_failure', label: 'Sensor / ADC Failure', defaultThreshold: 1, op: 'gt' },
  { value: 'unusual_consumption', label: 'Unusual Consumption (W)', defaultThreshold: 4000, op: 'gt' },
];

export default function AlertsPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const { devices, selectedDeviceId, alerts, alertRules, acknowledgeAlert, saveAlertRule } = useData();

  const [deviceId, setDeviceId] = useState(selectedDeviceId || '');
  const [alertType, setAlertType] = useState<AlertType>('high_power');
  const [threshold, setThreshold] = useState('3500');
  const [secondaryThreshold, setSecondaryThreshold] = useState('253');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  useEffect(() => {
    if (!deviceId && devices[0]) setDeviceId(devices[0].deviceId);
  }, [deviceId, devices]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const activeSpec = ALERT_TYPES.find((t) => t.value === alertType)!;

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId) return;
    await saveAlertRule({
      deviceId,
      alertType,
      thresholdValue: Number(threshold),
      comparisonOperator: activeSpec.op,
      secondaryThreshold: activeSpec.op === 'outside_range' ? Number(secondaryThreshold) : null,
      severity,
      enabled: true,
      pushEnabled,
    });
    setSavedNotice(`Saved ${alertType.replaceAll('_', ' ')} rule for ${deviceId}`);
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Bell size={24} color="#29378F" />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Alerts &amp; Threshold Rules</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--sem-muted)' }}>
            Configure electrical anomaly alerts and push notification triggers
          </p>
        </div>
      </div>

      {/* Mandatory Electrical Safety Advisory */}
      <div
        style={{
          background: 'rgba(217, 48, 37, 0.1)',
          border: '1px solid rgba(217, 48, 37, 0.3)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 18,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 13,
        }}
      >
        <ShieldAlert size={19} color="#D93025" style={{ flexShrink: 0 }} />
        <span>
          <strong>Advisory Monitoring Only:</strong> Smart Energy Monitor alerts provide informational notifications and never act as an automatic circuit breaker, MCB, or protective relay.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 }}>
        {/* Alert History Feed */}
        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Recent Alerts ({alerts.length})</h2>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>No active or historical alerts.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a) => (
                <div key={a.id} className="sem-lavender-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={15} color={a.severity === 'critical' ? '#D93025' : '#F58220'} />
                      {a.alertType.replaceAll('_', ' ').toUpperCase()}
                    </span>
                    <StatusBadge
                      tone={a.status === 'acknowledged' ? 'success' : a.severity === 'critical' ? 'error' : 'warning'}
                      label={a.status.toUpperCase()}
                    />
                  </div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--sem-muted)', marginTop: 4 }}>
                    Device: {a.deviceId} • Observed: {a.observedValue} (Threshold: {a.thresholdValue}) • {formatKolkataDateTime(a.createdAt)} IST
                  </div>
                  {a.status === 'active' && (
                    <button
                      type="button"
                      className="sem-btn sem-btn-outline"
                      style={{ marginTop: 8, padding: '5px 10px', fontSize: 12 }}
                      onClick={() => void acknowledgeAlert(a.id)}
                    >
                      <Check size={14} /> Acknowledge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rule Builder + Active Rules */}
        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Configure Alert Rule</h2>
          <form onSubmit={handleCreateRule} style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            <select
              aria-label="Target device for alert rule"
              className="sem-input"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name} ({d.deviceId})
                </option>
              ))}
            </select>

            <select
              aria-label="Alert type"
              className="sem-input"
              value={alertType}
              onChange={(e) => {
                const next = e.target.value as AlertType;
                setAlertType(next);
                const found = ALERT_TYPES.find((t) => t.value === next);
                if (found) setThreshold(String(found.defaultThreshold));
              }}
            >
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: activeSpec.op === 'outside_range' ? '1fr 1fr' : '1fr', gap: 8 }}>
              <input
                type="number"
                step="0.01"
                className="sem-input"
                aria-label="Primary threshold"
                placeholder="Threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                required
              />
              {activeSpec.op === 'outside_range' && (
                <input
                  type="number"
                  step="0.1"
                  className="sem-input"
                  aria-label="Upper bound voltage"
                  placeholder="Max Voltage (V)"
                  value={secondaryThreshold}
                  onChange={(e) => setSecondaryThreshold(e.target.value)}
                />
              )}
            </div>

            <select className="sem-input" value={severity} onChange={(e) => setSeverity(e.target.value as 'info' | 'warning' | 'critical')}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} />
              Send Android Push Notification when triggered
            </label>

            {savedNotice && (
              <div style={{ fontSize: 12, color: 'var(--sem-success)', fontWeight: 700 }}>{savedNotice}</div>
            )}

            <button type="submit" className="sem-btn sem-btn-primary">
              <Plus size={16} /> Add Alert Rule
            </button>
          </form>

          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Configured Rules ({alertRules.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {alertRules.map((r) => (
              <div key={r.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sem-border)', fontSize: 12 }}>
                <strong>{r.alertType}</strong> • {r.deviceId} • {r.comparisonOperator} {r.thresholdValue}
                {r.secondaryThreshold != null ? `..${r.secondaryThreshold}` : ''} ({r.severity})
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
