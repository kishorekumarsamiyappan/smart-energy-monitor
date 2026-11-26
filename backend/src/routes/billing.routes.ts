import { Router } from 'express';
import { billingCalculateRequestSchema, manualReadingInputSchema } from '@sem/shared';
import { z } from 'zod';
import { BillingService } from '../services/billing.service.js';
import { DeviceService } from '../services/device.service.js';
import { TelemetryService } from '../services/telemetry.service.js';

export function createBillingRouter(
  billingService: BillingService,
  deviceService: DeviceService,
  telemetryService: TelemetryService,
) {
  const router = Router();

  router.get('/current', async (req, res, next) => {
    try {
      const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
      const devices = await deviceService.listDevices(req.user!.id, req.user!.role);
      const target = deviceId
        ? await deviceService.resolveAuthorizedDevice(deviceId, req.user!.id, req.user!.role)
        : devices[0]
          ? await deviceService.resolveAuthorizedDevice(devices[0].deviceId, req.user!.id, req.user!.role)
          : null;

      if (!target) {
        res.json({ current: null, message: 'No devices paired yet.' });
        return;
      }

      const counter = await telemetryService.getEnergyCounter(target.id);
      const history = await billingService.getBillingHistory(req.user!.id);
      const latestClosed = history.cycles.find((c) => c.deviceId === target.device_id);
      const cycleStartKwh = latestClosed ? latestClosed.currentReading : 0;
      const nowDate = new Date().toISOString().slice(0, 10);
      const startDate = latestClosed ? latestClosed.periodEnd : new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

      const currentKwh = Math.max(cycleStartKwh, counter.lifetimeKwh);
      const tariff = await billingService.getActiveTariff(nowDate);
      const { calculateTnebBill } = await import('@sem/shared');
      const calculation = calculateTnebBill({
        deviceId: target.device_id,
        serviceCategory: 'LT-IA',
        consumerEligible: target.consumer_eligible_for_subsidy,
        previousReading: cycleStartKwh,
        currentReading: currentKwh,
        previousReadingDate: startDate,
        currentReadingDate: nowDate,
        readingSource: 'automatic_esp32',
        tariffVersion: tariff,
        counterResetCount: counter.counterResetCount,
      });

      res.json({ current: calculation, counter, tariff });
    } catch (err) {
      next(err);
    }
  });

  router.post('/calculate', async (req, res, next) => {
    try {
      const body = billingCalculateRequestSchema.parse(req.body);
      const dev = await deviceService.resolveAuthorizedDevice(body.deviceId, req.user!.id, req.user!.role);
      const result = await billingService.calculateAndPersistBill({
        userId: req.user!.id,
        deviceUuid: dev.id,
        deviceCode: dev.device_id,
        previousReading: body.previousReading,
        currentReading: body.currentReading,
        previousReadingDate: body.previousReadingDate,
        currentReadingDate: body.currentReadingDate,
        readingSource: body.readingSource,
        consumerEligible: body.consumerEligible,
        fixedChargesInr: body.fixedChargesInr,
        additionalChargesInr: body.additionalChargesInr,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/manual-reading', async (req, res, next) => {
    try {
      const body = manualReadingInputSchema.parse(req.body);
      const dev = await deviceService.resolveAuthorizedDevice(body.deviceId, req.user!.id, req.user!.role);
      const result = await billingService.submitManualReading({
        userId: req.user!.id,
        deviceUuid: dev.id,
        deviceCode: dev.device_id,
        consumerEligible: dev.consumer_eligible_for_subsidy,
        previousReading: body.previousReading,
        previousReadingDate: body.previousReadingDate,
        currentReading: body.currentReading,
        currentReadingDate: body.currentReadingDate,
        meterSerialNumber: body.meterSerialNumber,
        billPhotoUrl: body.billPhotoUrl || undefined,
        notes: body.notes,
        preferredSource: body.preferredSource,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req, res, next) => {
    try {
      const history = await billingService.getBillingHistory(req.user!.id);
      res.json(history);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const cycle = await billingService.getBillingRecordById(req.user!.id, req.params.id);
      res.json({ cycle });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/actual', async (req, res, next) => {
    try {
      const body = z
        .object({
          actualBillAmountInr: z.number().finite().min(0),
          officialBillNumber: z.string().max(64).optional(),
        })
        .parse(req.body);
      const updated = await billingService.recordActualBill(
        req.user!.id,
        req.params.id,
        body.actualBillAmountInr,
        body.officialBillNumber,
      );
      res.json({ cycle: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
