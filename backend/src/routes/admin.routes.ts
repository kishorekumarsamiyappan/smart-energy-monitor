import { Router } from 'express';
import { z } from 'zod';
import { DatabaseClient } from '../db/database.js';
import { AlertService } from '../services/alert.service.js';
import { DeviceService } from '../services/device.service.js';

export function createAdminRouter(
  db: DatabaseClient,
  deviceService: DeviceService,
  alertService: AlertService,
) {
  const router = Router();

  router.get('/users', async (_req, res, next) => {
    try {
      const r = await db.query(
        `SELECT id, full_name, email, mobile_number, role, organization, is_active, created_at
         FROM users ORDER BY created_at DESC`,
      );
      res.json({ users: r.rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/devices', async (req, res, next) => {
    try {
      const devices = await deviceService.listDevices(req.user!.id, 'admin');
      res.json({ devices });
    } catch (err) {
      next(err);
    }
  });

  router.post('/devices/:id/assign', async (req, res, next) => {
    try {
      const { ownerUserId } = z.object({ ownerUserId: z.string().uuid() }).parse(req.body);
      const device = await deviceService.assignOwnership(req.user!.id, req.params.id, ownerUserId);
      res.json({ device });
    } catch (err) {
      next(err);
    }
  });

  router.get('/status', async (_req, res, next) => {
    try {
      const [uCnt, dCnt, tCnt, aCnt] = await Promise.all([
        db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users`),
        db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM devices`),
        db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM telemetry`),
        db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM alerts WHERE status = 'active'`),
      ]);
      res.json({
        status: 'healthy',
        databaseEngine: db.kind,
        counts: {
          users: Number(uCnt.rows[0]?.c ?? 0),
          devices: Number(dCnt.rows[0]?.c ?? 0),
          telemetryRows: Number(tCnt.rows[0]?.c ?? 0),
          activeAlerts: Number(aCnt.rows[0]?.c ?? 0),
        },
        timestampUtc: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/alerts', async (req, res, next) => {
    try {
      const data = await alertService.listAlerts(req.user!.id, 'admin');
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
