import PDFDocument from 'pdfkit';
import { formatKolkataDateTime, TelemetryPoint } from '@sem/shared';

export type ReportType =
  | 'daily_energy'
  | 'weekly_energy'
  | 'monthly_energy'
  | 'billing_period'
  | 'electrical_parameters'
  | 'device_status'
  | 'alerts';

export function buildTelemetryCsv(deviceId: string, points: TelemetryPoint[]): string {
  const header = [
    'Device ID',
    'Timestamp (Asia/Kolkata)',
    'Voltage RMS (V)',
    'Current RMS (A)',
    'Active Power (W)',
    'Apparent Power (VA)',
    'Power Factor',
    'Frequency (Hz)',
    'Cumulative Energy (kWh)',
  ].join(',');

  const lines = points.map((p) =>
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

  return [header, ...lines].join('\n');
}

export async function buildReportPdf(options: {
  title: string;
  reportType: ReportType;
  deviceId: string;
  generatedBy: string;
  rows: Array<Record<string, string | number>>;
  disclaimer?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Indigo header strip matching app branding
    doc.rect(0, 0, doc.page.width, 72).fill('#29378F');
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('SMART ENERGY MONITOR', 40, 22);
    doc.fontSize(10).font('Helvetica').text(`${options.title} • ${options.deviceId}`, 40, 46);

    doc.moveDown(2.2);
    doc.fillColor('#273238').fontSize(10);
    doc.text(`Report Type: ${options.reportType}`);
    doc.text(`Generated (Asia/Kolkata): ${formatKolkataDateTime(new Date())} IST`);
    doc.text(`Requested By: ${options.generatedBy}`);
    doc.moveDown(1);

    if (options.rows.length === 0) {
      doc.fontSize(11).text('No records found for the requested filter range.');
    } else {
      const keys = Object.keys(options.rows[0]);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#29378F');
      doc.text(keys.join('   |   '));
      doc.moveTo(40, doc.y + 2).lineTo(doc.page.width - 40, doc.y + 2).stroke('#AAB2B5');
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(8.5).fillColor('#273238');
      for (const row of options.rows.slice(0, 80)) {
        const line = keys.map((k) => String(row[k] ?? '')).join('   |   ');
        doc.text(line);
        if (doc.y > doc.page.height - 70) {
          doc.addPage();
        }
      }
    }

    doc.moveDown(1.5);
    doc
      .fontSize(8.5)
      .fillColor('#5C6773')
      .text(
        options.disclaimer ||
          'Advisory monitoring & indicative estimation report. All timestamps formatted in Asia/Kolkata (IST).',
      );

    doc.end();
  });
}
