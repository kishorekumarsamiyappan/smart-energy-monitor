import { Router } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/billing.service.js';

export function createTariffRouter(billingService: BillingService) {
  const router = Router();

  router.get('/current', async (req, res, next) => {
    try {
      const asOf = typeof req.query.date === 'string' ? req.query.date : undefined;
      const tariff = await billingService.getActiveTariff(asOf);
      res.json({ tariff });
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (_req, res, next) => {
    try {
      const tariffs = await billingService.getAllTariffs();
      res.json({ tariffs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createAdminTariffRouter(billingService: BillingService) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const schema = z.object({
        versionCode: z.string().min(3).max(64),
        category: z.string().default('LT-IA'),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        isIndicative: z.boolean().default(false),
        officialVerified: z.boolean().default(false),
        sourceReference: z.string().min(3),
        subsidyRule: z.object({
          name: z.string().min(3),
          freeUnitsUpto500: z.number().int().min(0),
          freeUnitsAbove500: z.number().int().min(0),
          eligibilityRequired: z.boolean().default(true),
          notes: z.string().default(''),
        }),
        slabs: z
          .array(
            z.object({
              slabOrder: z.number().int().positive(),
              branch: z.enum(['UPTO_500', 'ABOVE_500', 'BASE_NON_SUBSIDY']),
              fromUnit: z.number().min(0),
              toUnit: z.number().positive().nullable(),
              ratePerUnitInr: z.number().min(0),
              fixedChargeInr: z.number().min(0).default(0),
              description: z.string().min(2),
            }),
          )
          .min(1),
      });

      const parsed = schema.parse(req.body);
      const tariff = await billingService.createTariff(req.user!.id, parsed);
      res.status(201).json({ tariff });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(['draft', 'active', 'archived']).optional(),
          officialVerified: z.boolean().optional(),
          isIndicative: z.boolean().optional(),
        })
        .parse(req.body);
      const tariff = await billingService.updateTariffStatus(req.user!.id, req.params.id, body);
      res.json({ tariff });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
