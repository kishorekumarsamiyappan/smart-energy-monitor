import { jsPDF } from 'jspdf';
import { formatKolkataDateTime, TelemetryPoint } from '@sem/shared';
import { getApiBaseUrl } from './api-client';

export function buildCsvFromTelemetry(deviceId: string, points: TelemetryPoint[]): string {
  const header = [
    'Device ID',
    'Timestamp (Asia/Kolkata)',
    'Voltage (V)',
    'Current (A)',
    'Active Power (W)',
    'Apparent Power (VA)',
    'Power Factor',
    'Frequency (Hz)',
    'Energy (kWh)',
  ].join(',');

  const rows = points.map((p) =>
    [
      deviceId,
      `"${formatKolkataDateTime(p.ingestedAt || p.deviceTimestamp)} IST"`,
      p.voltageRms.toFixed(2),
      p.currentRms.toFixed(3),
      p.activePowerW.toFixed(2),
      p.apparentPowerVa.toFixed(2),
      p.powerFactor.toFixed(3),
      p.frequencyHz.toFixed(2),
      p.energyKwh.toFixed(4),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function triggerFileDownload(filename: string, content: string | Blob, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportTelemetryPdfClient(options: {
  deviceId: string;
  title: string;
  points: TelemetryPoint[];
  isDemo?: boolean;
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(41, 55, 143);
  doc.rect(0, 0, 595, 68, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text('SMART ENERGY MONITOR', 36, 30);
  doc.setFontSize(10);
  doc.text(`${options.title} — ${options.deviceId}${options.isDemo ? ' [DEMO DATA]' : ''}`, 36, 48);

  doc.setTextColor(39, 50, 56);
  doc.setFontSize(10);
  doc.text(`Generated (Asia/Kolkata): ${formatKolkataDateTime(new Date())} IST`, 36, 92);
  doc.text(`Samples included: ${options.points.length}`, 36, 108);

  let y = 136;
  doc.setFontSize(9);
  doc.setTextColor(41, 55, 143);
  doc.text('Timestamp (IST)                 |   V   |   A   |   W   |  PF  |  Hz   |   kWh', 36, y);
  y += 14;
  doc.setTextColor(39, 50, 56);

  for (const pt of options.points.slice(0, 38)) {
    const line = `${formatKolkataDateTime(pt.ingestedAt)} | ${pt.voltageRms.toFixed(1)} | ${pt.currentRms.toFixed(2)} | ${pt.activePowerW.toFixed(0)} | ${pt.powerFactor.toFixed(2)} | ${pt.frequencyHz.toFixed(2)} | ${pt.energyKwh.toFixed(2)}`;
    doc.text(line, 36, y);
    y += 15;
    if (y > 780) {
      doc.addPage();
      y = 48;
    }
  }

  doc.save(`sem-report-${options.deviceId}.pdf`);
}

export async function downloadBackendReport(options: {
  format: 'csv' | 'pdf';
  type: string;
  deviceId: string;
  token: string;
  days?: number;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams({
    deviceId: options.deviceId,
    type: options.type,
    days: String(options.days ?? 7),
  });
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);

  const res = await fetch(`${getApiBaseUrl()}/reports/${options.format}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  triggerFileDownload(`sem-${options.type}-${options.deviceId}.${options.format}`, blob, blob.type);
}
