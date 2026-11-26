import { Router } from 'express';
import { formatKolkataDateTime } from '@sem/shared';
import { AlertService } from '../services/alert.service.js';
import { BillingService } from '../services/billing.service.js';
import { DeviceService } from '../services/device.service.js';
import { buildReportPdf, buildTelemetryCsv, ReportType } from '../services/report.service.js';
import { TelemetryService } from '../services/telemetry.service.js';

export function createReportRouter(
  deviceService: DeviceService,
  telemetryService: TelemetryService,
  billingService: BillingService,
  alertService: AlertService,
) {
  const router = Router();

  router.get('/csv', async (req, res, next) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
      const reportType = (typeof req.query.type === 'string' ? req.query.type : 'electrical_parameters') as ReportType;
      const days = req.query.days ? Number(req.query.days) : 7;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

      const devices = await deviceService.listDevices(req.user!.id, req.user!.role);
      const dev = deviceId
        ? await deviceService.resolveAuthorizedDevice(deviceId, req.user!.id, req.user!.role)
        : devices[0]
          ? await deviceService.resolveAuthorizedDevice(devices[0].deviceId, req.user!.id, req.user!.role)
          : null;

      if (!dev) {
        res.status(404).json({ error: 'No device available for export' });
        return;
      }

      let csvContent = '';
      if (reportType === 'billing_period') {
        const { cycles } = await billingService.getBillingHistory(req.user!.id);
        const header = 'Period Start,Period End,Device,Previous (kWh),Current (kWh),Units (kWh),Source,Estimated (INR),Actual (INR),Status';
        const rows = cycles.map((c) =>
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
            c.status,
          ].join(','),
        );
        csvContent = [header, ...rows].join('\n');
      } else if (reportType === 'alerts') {
        const { alerts } = await alertService.listAlerts(req.user!.id, req.user!.role);
        const header = 'Timestamp (IST),Device,Alert Type,Severity,Threshold,Observed,Status,Message';
        const rows = alerts.map((a) =>
          [
            `"${formatKolkataDateTime(a.createdAt)} IST"`,
            a.deviceId,
            a.alertType,
            a.severity,
            a.thresholdValue,
            a.observedValue,
            a.status,
            `"${a.message.replaceAll('"', '""')}"`,
          ].join(','),
        );
        csvContent = [header, ...rows].join('\n');
      } else {
        const { points } = await telemetryService.getHistory(dev.id, { days, startDate, endDate });
        csvContent = buildTelemetryCsv(dev.device_id, points);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sem-${reportType}-${dev.device_id}.csv"`);
      res.send(csvContent);
    } catch (err) {
      next(err);
    }
  });

  router.get('/pdf', async (req, res, next) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
      const reportType = (typeof req.query.type === 'string' ? req.query.type : 'electrical_parameters') as ReportType;
      const days = req.query.days ? Number(req.query.days) : 7;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

      const devices = await deviceService.listDevices(req.user!.id, req.user!.role);
      const dev = deviceId
        ? await deviceService.resolveAuthorizedDevice(deviceId, req.user!.id, req.user!.role)
        : devices[0]
          ? await deviceService.resolveAuthorizedDevice(devices[0].deviceId, req.user!.id, req.user!.role)
          : null;

      if (!dev) {
        res.status(404).json({ error: 'No device available for export' });
        return;
      }

      let rows: Array<Record<string, string | number>> = [];
      if (reportType === 'billing_period') {
        const { cycles } = await billingService.getBillingHistory(req.user!.id);
        rows = cycles.map((c) => ({
          Period: `${c.periodStart}..${c.periodEnd}`,
          Units: `${c.unitsConsumed} kWh`,
          Source: c.readingSource,
          EstINR: `Rs ${c.estimatedAmountInr.toFixed(2)}`,
          ActualINR: c.actualBillAmountInr != null ? `Rs ${c.actualBillAmountInr.toFixed(2)}` : '-',
          Status: c.status,
        }));
      } else if (reportType === 'alerts') {
        const { alerts } = await alertService.listAlerts(req.user!.id, req.user!.role);
        rows = alerts.map((a) => ({
          TimeIST: formatKolkataDateTime(a.createdAt),
          Type: a.alertType,
          Severity: a.severity,
          Observed: a.observedValue,
          Status: a.status,
        }));
      } else if (reportType === 'device_status') {
        rows = devices.map((d) => ({
          DeviceID: d.deviceId,
          Name: d.name,
          Online: d.isOnline ? 'ONLINE' : 'OFFLINE',
          RSSI: d.wifiRssiDbm != null ? `${d.wifiRssiDbm} dBm` : '-',
          Firmware: d.firmwareVersion,
        }));
      } else {
        const { points } = await telemetryService.getHistory(dev.id, { days, startDate, endDate });
        rows = points.map((p) => ({
          TimeIST: formatKolkataDateTime(p.ingestedAt),
          V: p.voltageRms.toFixed(1),
          A: p.currentRms.toFixed(2),
          W: p.activePowerW.toFixed(0),
          PF: p.powerFactor.toFixed(2),
          Hz: p.frequencyHz.toFixed(2),
          kWh: p.energyKwh.toFixed(3),
        }));
      }

      const pdfBuffer = await buildReportPdf({
        title: `Report: ${reportType.replaceAll('_', ' ').toUpperCase()}`,
        reportType,
        deviceId: dev.device_id,
        generatedBy: req.user!.email,
        rows,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sem-${reportType}-${dev.device_id}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
