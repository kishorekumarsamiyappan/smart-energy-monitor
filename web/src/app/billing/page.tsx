'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Receipt, RefreshCw, RotateCcw } from 'lucide-react';
import {
  BillingCycleRecord,
  calculateTnebBill,
  formatKolkataDate,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
  ReadingSource,
} from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import { triggerFileDownload } from '@/lib/export-utils';
import { jsPDF } from 'jspdf';

export default function BillingPage() {
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const { devices, selectedDeviceId, latestByDevice, billingCycles, activeTariff, saveBillingEstimate, recordActualBill } = useData();

  const device = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];
  const latest = device ? latestByDevice[device.deviceId] : null;
  const draftKey = `sem_billing_draft_${user?.id ?? (isDemoMode ? 'demo' : 'guest')}_${device?.deviceId ?? 'default'}`;

  const [prevRead, setPrevRead] = useState('0');
  const [currRead, setCurrRead] = useState('0');
  const [readingSource, setReadingSource] = useState<ReadingSource>('automatic_esp32');
  const [eligible, setEligible] = useState(true);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [actualInputById, setActualInputById] = useState<Record<string, string>>({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const loadedDraftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  useEffect(() => {
    if (isLoading || (!user && !isDemoMode)) return;
    if (loadedDraftKeyRef.current === draftKey) return;
    loadedDraftKeyRef.current = draftKey;

    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(draftKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          prevRead?: string;
          currRead?: string;
          readingSource?: ReadingSource;
          eligible?: boolean;
        };
        setPrevRead(parsed.prevRead ?? '0');
        setCurrRead(parsed.currRead ?? '0');
        setReadingSource(parsed.readingSource ?? 'automatic_esp32');
        setEligible(parsed.eligible ?? (device?.consumerEligibleForSubsidy ?? true));
        return;
      }
    } catch {
      // Ignore invalid local draft JSON
    }
    setPrevRead('0');
    setCurrRead('0');
    setReadingSource('automatic_esp32');
    setEligible(device?.consumerEligibleForSubsidy ?? true);
  }, [device?.consumerEligibleForSubsidy, draftKey, isDemoMode, isLoading, user]);

  const persistDraft = (patch: {
    prevRead?: string;
    currRead?: string;
    readingSource?: ReadingSource;
    eligible?: boolean;
  }) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          prevRead: patch.prevRead ?? prevRead,
          currRead: patch.currRead ?? currRead,
          readingSource: patch.readingSource ?? readingSource,
          eligible: patch.eligible ?? eligible,
        }),
      );
    } catch {
      // Ignore storage quota errors
    }
  };

  if (isLoading || (!user && !isDemoMode)) return null;

  const endDateIso = new Date().toISOString().slice(0, 10);
  const startDateIso = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

  let calcError: string | null = null;
  let calcResult = null;
  try {
    calcResult = calculateTnebBill({
      deviceId: device?.deviceId ?? 'SEM_ESP32S3_01',
      serviceCategory: 'LT-IA',
      consumerEligible: eligible,
      previousReading: Number(prevRead),
      currentReading: Number(currRead),
      previousReadingDate: startDateIso,
      currentReadingDate: endDateIso,
      readingSource,
      tariffVersion: activeTariff ?? INDICATIVE_2026_TNEB_LT1A_TARIFF,
    });
  } catch (e) {
    calcError = e instanceof Error ? e.message : 'Invalid reading inputs';
  }

  const exportBillingCsv = () => {
    const header = 'Period Start,Period End,Device,Prev (kWh),Curr (kWh),Units,Source,Est (INR),Actual (INR),Variance (INR),Status';
    const rows = billingCycles.map((c) =>
      [
        c.periodStart,
        c.periodEnd,
        c.deviceId,
        c.previousReading,
        c.currentReading,
        c.unitsConsumed,
        c.readingSource,
        c.estimatedAmountInr.toFixed(2),
        c.actualBillAmountInr != null ? c.actualBillAmountInr.toFixed(2) : '',
        c.varianceAmountInr != null ? c.varianceAmountInr.toFixed(2) : '',
        c.status,
      ].join(','),
    );
    triggerFileDownload('tneb-billing-history.csv', [header, ...rows].join('\n'), 'text/csv;charset=utf-8');
  };

  const exportCyclePdf = (c: BillingCycleRecord) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFillColor(41, 55, 143);
    doc.rect(0, 0, 595, 68, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.text('TNEB / TNPDCL LT-IA BILL ESTIMATE', 36, 32);
    doc.setFontSize(10);
    doc.text(`Device: ${c.deviceId}  •  Period: ${c.periodStart} to ${c.periodEnd}`, 36, 50);

    doc.setTextColor(39, 50, 56);
    doc.setFontSize(11);
    doc.text(`Units Consumed: ${c.unitsConsumed} kWh (${c.readingSource})`, 36, 98);
    doc.text(`Estimated Bill: Rs ${c.estimatedAmountInr.toFixed(2)}`, 36, 118);
    doc.text(`Actual EB Bill: ${c.actualBillAmountInr != null ? `Rs ${c.actualBillAmountInr.toFixed(2)}` : 'Not entered'}`, 36, 138);
    doc.text(`Tariff Version: ${c.tariffVersionCode}`, 36, 158);

    let y = 192;
    doc.setFontSize(10);
    doc.text('Slab Breakdown:', 36, y);
    y += 18;
    for (const s of c.calculationPayload.slabBreakdown) {
      doc.text(`${s.slabLabel}: ${s.unitsInSlab} units x Rs ${s.ratePerUnitInr.toFixed(2)} = Rs ${s.amountInr.toFixed(2)}`, 44, y);
      y += 16;
    }
    doc.save(`tneb-bill-${c.deviceId}-${c.periodEnd}.pdf`);
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>TNEB / TNPDCL LT-IA Billing</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sem-muted)' }}>
            Bi-monthly domestic slab calculator &amp; billing reconciliation
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/manual-reading" className="sem-btn sem-btn-primary">
            <FileSpreadsheet size={16} /> Enter Manual EB Reading
          </Link>
          <button type="button" className="sem-btn sem-btn-outline" onClick={exportBillingCsv}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Warning Notice */}
      <div
        style={{
          background: 'rgba(245, 130, 32, 0.14)',
          border: '1px solid rgba(245, 130, 32, 0.4)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 18,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 13,
        }}
      >
        <AlertTriangle size={20} color="#F58220" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Advisory Estimate Only ({activeTariff.versionCode}):</strong> Uses indicative 2026 TNEB LT-IA rates (≤500 units: 200 free; &gt;500 units: 100 free). Always verify official TNERC/TNPDCL tariff &amp; subsidy orders before treating any calculation as an official EB bill.
        </div>
      </div>

      {/* Interactive Calculator & Slab Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))', gap: 18, marginBottom: 22 }}>
        <div className="sem-card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Bi-Monthly Estimator (LT-IA)</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Previous Reading (kWh)</label>
                <input
                  type="number"
                  step="0.1"
                  className="sem-input"
                  value={prevRead}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setPrevRead(nextVal);
                    setSaveNotice(null);
                    persistDraft({ prevRead: nextVal });
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Current Reading (kWh)</label>
                <input
                  type="number"
                  step="0.1"
                  className="sem-input"
                  value={currRead}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setCurrRead(nextVal);
                    setSaveNotice(null);
                    persistDraft({ currRead: nextVal });
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Reading Source</label>
              <select
                className="sem-input"
                value={readingSource}
                onChange={(e) => {
                  const nextSrc = e.target.value as ReadingSource;
                  setReadingSource(nextSrc);
                  persistDraft({ readingSource: nextSrc });
                }}
              >
                <option value="automatic_esp32">Automatic ESP32-S3 Lifetime Counter</option>
                <option value="manual_eb_meter">Manual EB Meter Reading</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eligible}
                onChange={(e) => {
                  const nextElig = e.target.checked;
                  setEligible(nextElig);
                  persistDraft({ eligible: nextElig });
                }}
              />
              Consumer eligible for Tamil Nadu domestic free-unit subsidy
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                style={{ padding: '7px 12px', fontSize: 12 }}
                disabled={!latest}
                onClick={() => {
                  if (!latest) return;
                  const nextCurr = latest.energyKwh.toFixed(2);
                  setCurrRead(nextCurr);
                  setSaveNotice(null);
                  persistDraft({ currRead: nextCurr });
                }}
              >
                <RefreshCw size={14} /> Sync Live kWh
              </button>
              <button
                type="button"
                className="sem-btn sem-btn-outline"
                style={{ padding: '7px 12px', fontSize: 12 }}
                onClick={() => {
                  setPrevRead('0');
                  setCurrRead('0');
                  setSaveNotice(null);
                  persistDraft({ prevRead: '0', currRead: '0' });
                }}
              >
                <RotateCcw size={14} /> Reset to 0
              </button>
              {device && !calcError && calcResult && (
                <button
                  type="button"
                  className="sem-btn sem-btn-primary"
                  style={{ padding: '7px 12px', fontSize: 12, marginLeft: 'auto' }}
                  onClick={async () => {
                    await saveBillingEstimate({
                      deviceId: device.deviceId,
                      previousReading: Number(prevRead),
                      currentReading: Number(currRead),
                      previousReadingDate: startDateIso,
                      currentReadingDate: endDateIso,
                      readingSource,
                      consumerEligible: eligible,
                    });
                    setSaveNotice('Billing estimate saved to history.');
                  }}
                >
                  <CheckCircle2 size={14} /> Save Estimate
                </button>
              )}
            </div>
            {saveNotice && (
              <div style={{ color: 'var(--sem-success)', fontSize: 12.5, fontWeight: 700 }}>{saveNotice}</div>
            )}

            {calcError ? (
              <div style={{ color: 'var(--sem-error)', fontWeight: 600, fontSize: 13 }}>{calcError}</div>
            ) : (
              calcResult && (
                <div className="sem-lavender-card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Estimated Total</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--sem-primary)' }}>
                      ₹{calcResult.totalEstimatedAmountInr.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: 'var(--sem-muted)' }}>
                    <span>Consumed: <strong>{calcResult.unitsConsumed} units</strong></span>
                    <span>Free Subsidy: <strong>{calcResult.freeUnitsApplied} units</strong></span>
                    <span>Branch: <strong>{calcResult.tariffBranchApplied}</strong></span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Slab-by-Slab Breakdown Card */}
        <div className="sem-card" style={{ padding: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Slab-by-Slab Calculation</h2>
          {calcResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {calcResult.slabBreakdown.length === 0 ? (
                <div style={{ color: 'var(--sem-muted)', fontSize: 13 }}>0 units consumed — ₹0.00 energy charges.</div>
              ) : (
                calcResult.slabBreakdown.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: s.isSubsidyFree ? 'rgba(27, 158, 75, 0.1)' : 'var(--sem-surface)',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong>{s.slabLabel}</strong>
                      <div style={{ fontSize: 11, color: 'var(--sem-muted)' }}>
                        {s.unitsInSlab} units × ₹{s.ratePerUnitInr.toFixed(2)}/unit
                      </div>
                    </div>
                    <strong style={{ color: s.isSubsidyFree ? 'var(--sem-success)' : 'var(--sem-text)' }}>
                      {s.isSubsidyFree ? 'FREE' : `₹${s.amountInr.toFixed(2)}`}
                    </strong>
                  </div>
                ))
              )}
              <hr className="sem-dashed-divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>Subsidy Savings</span>
                <strong style={{ color: 'var(--sem-success)' }}>₹{calcResult.subsidySavingsInr.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                <strong>Total Estimated Amount</strong>
                <strong style={{ color: 'var(--sem-primary)' }}>₹{calcResult.totalEstimatedAmountInr.toFixed(2)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Billing History Cards */}
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Billing History</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {billingCycles.map((c) => {
          const isExpanded = expandedCycleId === c.id;
          return (
            <div key={c.id} className="sem-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Receipt size={18} color="var(--sem-primary)" />
                    <strong style={{ fontSize: 15 }}>
                      {formatKolkataDate(c.periodStart)} – {formatKolkataDate(c.periodEnd)}
                    </strong>
                    <StatusBadge
                      tone={c.status === 'billed' ? 'success' : 'info'}
                      label={c.status.toUpperCase()}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 4 }}>
                    Device: {c.deviceId} • {c.unitsConsumed} units • Source: {c.readingSource} • Tariff: {c.tariffVersionCode}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sem-primary)' }}>
                    Est: ₹{c.estimatedAmountInr.toFixed(2)}
                  </div>
                  {c.actualBillAmountInr != null && (
                    <div style={{ fontSize: 12, color: 'var(--sem-success)', fontWeight: 700 }}>
                      Actual: ₹{c.actualBillAmountInr.toFixed(2)} (Diff: ₹{(c.varianceAmountInr ?? 0).toFixed(2)})
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setExpandedCycleId(isExpanded ? null : c.id)}
                >
                  {isExpanded ? 'Hide Calculation' : 'View Complete Calculation'}
                </button>
                <button
                  type="button"
                  className="sem-btn sem-btn-outline"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => exportCyclePdf(c)}
                >
                  <FileText size={14} /> Export PDF
                </button>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                  <input
                    type="number"
                    placeholder="Actual EB ₹"
                    className="sem-input"
                    style={{ width: 120, padding: '6px 10px', fontSize: 12 }}
                    value={actualInputById[c.id] ?? ''}
                    onChange={(e) => setActualInputById((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="sem-btn sem-btn-primary"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => {
                      const val = Number(actualInputById[c.id]);
                      if (Number.isFinite(val) && val >= 0) {
                        void recordActualBill(c.id, val);
                      }
                    }}
                  >
                    <CheckCircle2 size={14} /> Save Actual Bill
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="sem-lavender-card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    Slab Breakdown ({c.previousReading} → {c.currentReading} kWh = {c.unitsConsumed} units)
                  </div>
                  {c.calculationPayload.slabBreakdown.map((sl, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                      <span>{sl.slabLabel} ({sl.unitsInSlab} × ₹{sl.ratePerUnitInr.toFixed(2)})</span>
                      <strong>₹{sl.amountInr.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
