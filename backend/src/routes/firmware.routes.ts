import { Router } from 'express';
import { z } from 'zod';
import { FirmwareService } from '../services/firmware.service.js';

export function createFirmwareRouter(firmwareService: FirmwareService) {
  const router = Router();

  router.get('/releases', async (_req, res, next) => {
    try {
      const releases = await firmwareService.listReleases();
      res.json({ releases });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createAdminFirmwareRouter(firmwareService: FirmwareService) {
  const router = Router();

  router.post('/sync-github', async (req, res, next) => {
    try {
      const { repo } = z.object({ repo: z.string().trim().optional() }).parse(req.body ?? {});
      const release = await firmwareService.syncFromGithub(repo);
      res.json({ release });
    } catch (err) {
      next(err);
    }
  });

  router.post('/releases', async (req, res, next) => {
    try {
      const parsed = z
        .object({
          version: z.string().trim().min(1).max(40),
          tagName: z.string().trim().max(64).optional(),
          githubRepo: z.string().trim().max(160).nullable().optional(),
          binaryUrl: z.string().url(),
          checksumSha256: z.string().trim().max(64).nullable().optional(),
          releaseNotes: z.string().optional(),
          fileSizeBytes: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      const release = await firmwareService.registerRelease(parsed);
      res.status(201).json({ release });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
