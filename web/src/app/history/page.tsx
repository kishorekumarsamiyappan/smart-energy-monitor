'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Download, FileText, RefreshCw } from 'lucide-react';
import { summarizeTelemetry } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { SegmentedPillTabs } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import {
  buildCsvFromTelemetry,
  downloadBackendReport,
  exportTelemetryPdfClient,
  triggerFileDownload,
} from '@/lib/export-utils';

type HistoryTab = 'voltage' | 'current' | 'active_power' | 'energy' | 'power_factor' | 'frequency';
type DateRangeFilter = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export default function EnergyHistoryPage() {
  const router = useRouter();
  const { user, token, isDemoMode, isLoading } = useAuth();
  const { devices, selectedDeviceId, setSelectedDeviceId, historyByDevice, loadDeviceHistory } = useData();

  const [tab, setTab] = useState<HistoryTab>('voltage');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('today');
  const [customStart, setCustomStart] = useState('2026-11-18');
  const [customEnd, setCustomEnd] = useState('2026-11-25');
  const [reportType, setReportType] = useState('daily_energy');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  const device = devices.find((d) => d.deviceId === selectedDeviceId) || devices[0];
  const points = device ? historyByDevice[device.deviceId] ?? [] : [];

  const daysForFilter = dateFilter === '30d' ? 30 : dateFilter === '7d' ? 7 : 1;

  useEffect(() => {
    if (!device) return;
    if (dateFilter === 'custom') {
      void loadDeviceHistory(device.deviceId, 30, customStart, customEnd);
    } else {
      void loadDeviceHistory(device.deviceId, daysForFilter);
    }
  }, [customEnd, customStart, dateFilter, daysForFilter, device, loadDeviceHistory]);

  const stats = useMemo(() => summarizeTelemetry(points), [points]);

  const activeMetricStats = useMemo(() => {
    switch (tab) {
      case 'voltage':
        return { unit: 'V', min: stats.minVoltage, max: stats.maxVoltage, avg: stats.avgVoltage, color: '#F58220', label: 'Voltage' };
      case 'current':
        return { unit: 'A', min: stats.minCurrent, max: stats.maxCurrent, avg: stats.avgCurrent, color: '#1B9E4B', label: 'Current' };
      case 'active_power':
        return { unit: 'W', min: stats.minPowerW, max: stats.maxPowerW, avg: stats.avgPowerW, color: '#29378F', label: 'Active Power' };
      case 'energy':
        return { unit: 'kWh', min: points[0]?.energyKwh ?? 0, max: points[points.length - 1]?.energyKwh ?? 0, avg: stats.totalEnergyKwh, color: '#4054B2', label: 'Energy Counter' };
      case 'power_factor':
        return { unit: 'PF', min: stats.minPowerFactor, max: stats.maxPowerFactor, avg: stats.avgPowerFactor, color: '#1B9E4B', label: 'Power Factor' };
      case 'frequency':
        return { unit: 'Hz', min: stats.minFrequencyHz, max: stats.maxFrequencyHz, avg: stats.avgFrequencyHz, color: '#4054B2', label: 'Frequency' };
    }
  }, [points, stats, tab]);

  const series = useMemo(() => {
    return [
      {
        key: tab,
        label: activeMetricStats.label,
        unit: activeMetricStats.unit,
        color: activeMetricStats.color,
        data: points.map((p) => ({
          timestamp: p.deviceTimestamp,
          value:
            tab === 'voltage'
              ? p.voltageRms
              : tab === 'current'
                ? p.currentRms
                : tab === 'active_power'
                  ? p.activePowerW
                  : tab === 'energy'
                    ? p.energyKwh
                    : tab === 'power_factor'
                      ? p.powerFactor
                      : p.frequencyHz,
        })),
      },
    ];
  }, [activeMetricStats, points, tab]);

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!device) return;
    setExportStatus(null);
    try {
      if (isDemoMode || !token) {
        if (format === 'csv') {
          const csv = buildCsvFromTelemetry(device.deviceId, points);
          triggerFileDownload(`sem-${reportType}-${device.deviceId}-demo.csv`, csv, 'text/csv;charset=utf-8');
        } else {
          exportTelemetryPdfClient({
            deviceId: device.deviceId,
            title: reportType.replaceAll('_', ' ').toUpperCase(),
            points,
            isDemo: isDemoMode,
          });
        }
        setExportStatus(`Exported ${format.toUpperCase()} (${reportType})`);
        return;
      }

      await downloadBackendReport({
        format,
        type: reportType,
        deviceId: device.deviceId,
        token,
        days: daysForFilter,
        startDate: dateFilter === 'custom' ? customStart : undefined,
        endDate: dateFilter === 'custom' ? customEnd : undefined,
      });
      setExportStatus(`Downloaded ${format.toUpperCase()} report from server.`);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  if (isLoading || (!user && !isDemoMode)) return null;

  const dailyUsageKwh = Math.round((stats.totalEnergyKwh / Math.max(1, daysForFilter)) * 1000) / 1000;

  return (
    <AppShell>
      {/* Top Bar matching AVR History screenshot */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" aria-label="Back to dashboard" style={{ color: 'var(--sem-primary)' }}>
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>
              {device ? `${device.name} (${device.deviceId})` : 'Energy History'}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--sem-muted)' }}>
              Historical database analytics &amp; exports (Asia/Kolkata IST)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {devices.length > 1 && (
            <select
              aria-label="History device selector"
              className="sem-input"
              style={{ width: 'auto' }}
              value={device?.deviceId ?? ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="sem-btn sem-btn-primary"
            style={{ borderRadius: '50%', width: 42, height: 42, padding: 0 }}
            onClick={() => void handleExport('csv')}
            title="Download CSV Report"
            aria-label="Download CSV Report"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ padding: '8px 14px', fontSize: 13 }}
            onClick={() => void handleExport('pdf')}
          >
            <FileText size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* 6 Segmented Pill Tabs matching AVR Tab Bar */}
      <div style={{ marginBottom: 16 }}>
        <SegmentedPillTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'voltage', label: 'Voltage' },
            { id: 'current', label: 'Current' },
            { id: 'active_power', label: 'Active Power' },
            { id: 'energy', label: 'Energy' },
            { id: 'power_factor', label: 'Power Factor' },
            { id: 'frequency', label: 'Frequency' },
          ]}
        />
      </div>

      {/* Date Range & Report Selector */}
      <div className="sem-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <div className="sem-floating-group" style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sem-floating-label">Start date - End date</span>
            <select
              aria-label="Date range filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
              style={{ border: 'none', background: 'transparent', width: '100%', fontSize: 14, fontWeight: 600, color: 'var(--sem-text)', outline: 'none' }}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom date range</option>
            </select>
            <Calendar size={20} color="#29378F" />
          </div>

          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" className="sem-input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="Custom start date" />
              <span>to</span>
              <input type="date" className="sem-input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="Custom end date" />
            </div>
          )}

          <select
            aria-label="Report type"
            className="sem-input"
            style={{ width: 'auto' }}
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="daily_energy">Daily Energy Report</option>
            <option value="weekly_energy">Weekly Energy Report</option>
            <option value="monthly_energy">Monthly Energy Report</option>
            <option value="billing_period">Billing-Period Report</option>
            <option value="electrical_parameters">Electrical Parameter Report</option>
            <option value="device_status">Device Status Report</option>
            <option value="alerts">Alert Report</option>
          </select>

          <button
            type="button"
            className="sem-btn sem-btn-outline"
            style={{ borderRadius: '50%', width: 42, height: 42, padding: 0 }}
            onClick={() => device && void loadDeviceHistory(device.deviceId, daysForFilter)}
            aria-label="Refresh history"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        {exportStatus && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--sem-lavender)', fontSize: 13, fontWeight: 600 }}>
            {exportStatus}
          </div>
        )}

        {/* Summary Stats Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Minimum', value: `${activeMetricStats.min} ${activeMetricStats.unit}` },
            { label: 'Maximum', value: `${activeMetricStats.max} ${activeMetricStats.unit}` },
            { label: 'Average', value: `${activeMetricStats.avg} ${activeMetricStats.unit}` },
            { label: 'Total Consumption', value: `${stats.totalEnergyKwh} kWh` },
            { label: 'Peak Power', value: `${stats.peakPowerW} W` },
            { label: 'Daily Energy Usage', value: `${dailyUsageKwh} kWh/d` },
          ].map((item) => (
            <div key={item.label} className="sem-lavender-card" style={{ padding: '10px 12px', borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sem-muted)' }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sem-primary)', marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <TelemetryChart series={series} showMinMax />
      </div>
    </AppShell>
  );
}
