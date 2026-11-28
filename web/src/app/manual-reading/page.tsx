'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Scale } from 'lucide-react';
import { compareReadingSources } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

export default function ManualReadingPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const { devices, selectedDeviceId, latestByDevice, manualReadings, submitManualReading } = useData();

  const device = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];
  const latest = device ? latestByDevice[device.deviceId] : null;

  const [previousReading, setPreviousReading] = useState('1320');
  const [previousDate, setPreviousDate] = useState('2026-10-01');
  const [currentReading, setCurrentReading] = useState('1685');
  const [currentDate, setCurrentDate] = useState('2026-11-25');
  const [serialNumber, setSerialNumber] = useState(device?.meterSerialNumber ?? 'TN-EB-884210');
  const [notes, setNotes] = useState('');
  const [preferredSource, setPreferredSource] = useState<'manual_eb_meter' | 'automatic_esp32'>('manual_eb_meter');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const manualUnits = Math.max(0, Number(currentReading) - Number(previousReading));
  const autoCycleUnits = latest ? Math.max(0, Math.round((latest.energyKwh - 1320) * 100) / 100) : manualUnits;
  const comparison = compareReadingSources(autoCycleUnits, manualUnits);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (!device) {
      setErrorMsg('Please select or pair a device first.');
      return;
    }
    const prev = Number(previousReading);
    const curr = Number(currentReading);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || curr < prev) {
      setErrorMsg('Current meter reading must be greater than or equal to previous reading.');
      return;
    }

    try {
      await submitManualReading({
        deviceId: device.deviceId,
        previousReading: prev,
        previousReadingDate: previousDate,
        currentReading: curr,
        currentReadingDate: currentDate,
        meterSerialNumber: serialNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        preferredSource,
      });
      setStatusMsg(
        `Saved manual reading (${manualUnits} kWh). Both manual and ESP32 records preserved; estimate generated from ${preferredSource}.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save manual reading');
    }
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/billing" aria-label="Back to billing" style={{ color: 'var(--sem-primary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Manual EB Meter Reading</h1>
          <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
            Reconcile physical TNPDCL/TNEB meter digits against ESP32-S3 cumulative energy
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <form onSubmit={handleSubmit} className="sem-card" style={{ padding: 20, display: 'grid', gap: 12 }}>
          {errorMsg && (
            <div style={{ color: 'var(--sem-error)', fontWeight: 600, fontSize: 13 }}>{errorMsg}</div>
          )}
          {statusMsg && (
            <div style={{ color: 'var(--sem-success)', fontWeight: 600, fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              <CheckCircle2 size={16} /> {statusMsg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Previous Reading (kWh)</label>
              <input type="number" step="0.1" className="sem-input" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Previous Date</label>
              <input type="date" className="sem-input" value={previousDate} onChange={(e) => setPreviousDate(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Current Reading (kWh)</label>
              <input type="number" step="0.1" className="sem-input" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Current Date</label>
              <input type="date" className="sem-input" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} required />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>EB Meter Serial Number (Optional)</label>
            <input className="sem-input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="TN-EB-..." />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Notes</label>
            <textarea className="sem-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Meter photo reference or reading observation" />
          </div>

          {/* Discrepancy Comparison Box */}
          <div
            className="sem-lavender-card"
            style={{
              padding: 14,
              border: comparison.disagrees ? '1.5px solid #F58220' : '1px solid var(--sem-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
              {comparison.disagrees ? <AlertCircle size={18} color="#F58220" /> : <Scale size={18} color="var(--sem-primary)" />}
              <span>Source Comparison</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, fontSize: 13 }}>
              <div>Manual EB Units: <strong>{comparison.manualKwh} kWh</strong></div>
              <div>ESP32 Units: <strong>{comparison.automaticKwh} kWh</strong></div>
              <div>Difference: <strong>{comparison.unitDifference} kWh</strong></div>
              <div>Variance: <strong>{comparison.percentageDifference ?? 0}%</strong></div>
            </div>
            {comparison.disagrees && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Readings disagree — Choose estimate source (both preserved):
                </label>
                <select
                  className="sem-input"
                  value={preferredSource}
                  onChange={(e) => setPreferredSource(e.target.value as 'manual_eb_meter' | 'automatic_esp32')}
                >
                  <option value="manual_eb_meter">Use Manual EB Meter ({comparison.manualKwh} kWh)</option>
                  <option value="automatic_esp32">Use ESP32 Automatic ({comparison.automaticKwh} kWh)</option>
                </select>
              </div>
            )}
          </div>

          <button type="submit" className="sem-btn sem-btn-primary">
            Save Manual Reading &amp; Estimate Bill
          </button>
        </form>

        {/* Preserved Manual Readings Log */}
        <div className="sem-card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Saved Manual Reading Records</h2>
          <p style={{ fontSize: 12, color: 'var(--sem-muted)' }}>
            Stored separately from automatic ESP32 telemetry; neither source silently overwrites the other.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {manualReadings.map((mr) => (
              <div key={mr.id} className="sem-lavender-card" style={{ padding: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>{mr.previousReadingDate} → {mr.currentReadingDate}</span>
                  <span style={{ color: 'var(--sem-primary)' }}>{mr.unitsConsumed} kWh</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 3 }}>
                  Meter: {mr.previousReading} → {mr.currentReading} | ESP32 Comp: {mr.automaticComparisonKwh ?? '-'} kWh (Δ {mr.discrepancyKwh ?? 0} kWh)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
