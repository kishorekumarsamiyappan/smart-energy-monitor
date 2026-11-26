import { Router } from 'express';
import { alertRuleSchema } from '@sem/shared';
import { z } from 'zod';
import { AlertService } from '../services/alert.service.js';
import { DeviceService } from '../services/device.service.js';

export function createAlertRouter(alertService: AlertService, deviceService: DeviceService) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const result = await alertService.listAlerts(req.user!.id, req.user!.role);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/acknowledge', async (req, res, next) => {
    try {
      await alertService.acknowledgeAlert(req.params.id, req.user!.id, req.user!.role);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/rules', async (req, res, next) => {
    try {
      const parsed = alertRuleSchema.parse(req.body);
      const dev = await deviceService.resolveAuthorizedDevice(parsed.deviceId, req.user!.id, req.user!.role);
      const rule = await alertService.createRule(req.user!.id, dev.id, dev.device_id, parsed);
      res.status(201).json({ rule });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/rules/:id', async (req, res, next) => {
    try {
      const patch = z
        .object({
          thresholdValue: z.number().finite().optional(),
          enabled: z.boolean().optional(),
          pushEnabled: z.boolean().optional(),
          severity: z.enum(['info', 'warning', 'critical']).optional(),
        })
        .parse(req.body);
      const rule = await alertService.updateRule(req.params.id, req.user!.id, req.user!.role, patch);
      res.json({ rule });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
