'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bluetooth, CheckCircle2, Info, KeyRound, Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

export default function AddDevicePage() {
  const router = useRouter();
  const { user, token, isDemoMode, isLoading } = useAuth();
  const { addDevice, refreshAll } = useData();

  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [meterSerial, setMeterSerial] = useState('');
  const [eligible, setEligible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [provisioningSecret, setProvisioningSecret] = useState<{
    deviceId: string;
    username: string;
    oneTimeSecret: string;
  } | null>(null);

  const webBleSupported =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const handleManualPair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanId = deviceId.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,32}$/.test(cleanId)) {
      setError('Device ID must be 4-32 characters (letters, digits, dash, or underscore).');
      return;
    }
    if (name.trim().length < 2) {
      setError('Please enter a friendly device name.');
      return;
    }

    setSubmitting(true);
    try {
      if (isDemoMode || !token) {
        await addDevice({
          deviceId: cleanId,
          name: name.trim(),
          locationLabel: locationLabel.trim() || undefined,
          consumerEligibleForSubsidy: eligible,
          meterSerialNumber: meterSerial.trim() || undefined,
        });
        router.push('/devices');
        return;
      }

      const res = await apiRequest<{
        device: { deviceId: string };
        mqttProvisioning: { username: string; oneTimeSecret: string };
      }>('/devices', {
        method: 'POST',
        token,
        body: JSON.stringify({
          deviceId: cleanId,
          name: name.trim(),
          locationLabel: locationLabel.trim() || undefined,
          serviceCategory: 'LT-IA',
          consumerEligibleForSubsidy: eligible,
          meterSerialNumber: meterSerial.trim() || undefined,
        }),
      });
      await refreshAll();
      setProvisioningSecret({
        deviceId: res.device.deviceId,
        username: res.mqttProvisioning.username,
        oneTimeSecret: res.mqttProvisioning.oneTimeSecret,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pair device');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/devices" aria-label="Back to devices" style={{ color: 'var(--sem-primary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Add Energy Device</h1>
          <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
            Pair your ESP32-S3 single-phase energy monitor
          </div>
        </div>
      </div>

      {/* Honest Browser BLE Compatibility Notice */}
      <div
        className="sem-lavender-card"
        style={{ padding: 14, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13 }}
      >
        <Info size={20} color="#29378F" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>BLE Wi-Fi Provisioning Notice:</strong> Web Bluetooth is only supported on select desktop/Android Chromium browsers (never on iOS Safari or Firefox).{' '}
          {webBleSupported
            ? 'This browser exposes navigator.bluetooth, or you can use the Smart Energy Monitor Android app for full BLE Wi-Fi provisioning.'
            : 'Your current browser does not expose Web Bluetooth; please pair manually below or use the Android Flutter app for BLE Wi-Fi provisioning.'}
        </div>
      </div>

      {provisioningSecret ? (
        <div className="sem-card" style={{ padding: 22, maxWidth: 580 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--sem-success)', fontWeight: 800, fontSize: 17 }}>
            <CheckCircle2 size={22} /> Device {provisioningSecret.deviceId} Paired!
          </div>
          <p style={{ fontSize: 13, color: 'var(--sem-muted)', lineHeight: 1.5 }}>
            Copy these one-time MQTT over TLS credentials into your ESP32-S3 BLE provisioning flow or NVS flasher. They are hashed in the database and will not be shown again.
          </p>
          <div className="sem-lavender-card" style={{ padding: 14, fontFamily: 'monospace', fontSize: 13 }}>
            <div><KeyRound size={14} /> MQTT Username: <strong>{provisioningSecret.username}</strong></div>
            <div style={{ marginTop: 6 }}>MQTT Password / Secret: <strong>{provisioningSecret.oneTimeSecret}</strong></div>
            <div style={{ marginTop: 6 }}>Telemetry Topic: <strong>energy/{provisioningSecret.deviceId}/telemetry</strong></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/devices" className="sem-btn sem-btn-primary">
              Go to Device List
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 18 }}>
          <form onSubmit={handleManualPair} className="sem-card" style={{ padding: 20, display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Manual Device ID Pairing</h2>
            {error && (
              <div style={{ color: 'var(--sem-error)', fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}
            <div>
              <label htmlFor="deviceId" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                ESP32-S3 Device ID
              </label>
              <input
                id="deviceId"
                className="sem-input"
                placeholder="DEVICE001"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="deviceName" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Friendly Name
              </label>
              <input
                id="deviceName"
                className="sem-input"
                placeholder="Main Home Distribution Board"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="locationLabel" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                Location / Panel Label (Optional)
              </label>
              <input
                id="locationLabel"
                className="sem-input"
                placeholder="Ground Floor EB Box"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="meterSerial" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                EB Meter Serial Number (Optional)
              </label>
              <input
                id="meterSerial"
                className="sem-input"
                placeholder="TN-EB-..."
                value={meterSerial}
                onChange={(e) => setMeterSerial(e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} />
              Consumer eligible for TNEB LT-IA domestic subsidy
            </label>

            <button type="submit" className="sem-btn sem-btn-primary" disabled={submitting}>
              <Plus size={16} /> {submitting ? 'Pairing...' : 'Pair Device to Account'}
            </button>
          </form>

          <div className="sem-card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bluetooth size={20} color="#4054B2" /> BLE Wi-Fi Provisioning Steps
            </h2>
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--sem-muted)' }}>
              <li>Power the ESP32-S3 monitor safely from its isolated 5V/3.3V supply.</li>
              <li>Hold the provisioning button for 3 seconds until BLE advertising (`SEM-DEVICE001`) begins.</li>
              <li>Open the Smart Energy Monitor Android app → Tap <strong>+</strong> → Select nearby device over BLE.</li>
              <li>Enter your 2.4 GHz Wi-Fi SSID &amp; password (never logged or exposed).</li>
              <li>ESP32 connects to Wi-Fi, authenticates with EMQX over TLS (port 8883), and reports online status.</li>
            </ol>
          </div>
        </div>
      )}
    </AppShell>
  );
}
