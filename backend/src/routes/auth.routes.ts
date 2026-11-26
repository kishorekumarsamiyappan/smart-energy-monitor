import { Router } from 'express';
import { loginSchema, registerSchema } from '@sem/shared';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';

export function createAuthRouter(
  authService: AuthService,
  requireAuth: ReturnType<typeof import('../middleware/auth.js').createAuthMiddleware>['requireAuth'],
) {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const result = await authService.register(parsed);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const result = await authService.login(parsed.identifier, parsed.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', requireAuth, async (req, res, next) => {
    try {
      await authService.logout(req.user?.tokenJti);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/forgot-password', async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const result = await authService.requestPasswordReset(email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-password', async (req, res, next) => {
    try {
      const body = z.object({ token: z.string().min(8), newPassword: z.string().min(8) }).parse(req.body);
      await authService.resetPassword(body.token, body.newPassword);
      res.json({ message: 'Password updated successfully.' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
        .parse(req.body);
      await authService.changePassword(req.user!.id, body.currentPassword, body.newPassword);
      res.json({ message: 'Password changed successfully.' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const user = await authService.getProfile(req.user!.id);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
      const body = z
        .object({
          fullName: z.string().trim().min(2).max(120).optional(),
          mobileNumber: z.string().trim().regex(/^[+]?[0-9]{10,15}$/).optional(),
          organization: z.string().trim().max(120).nullable().optional(),
          themePreference: z.enum(['light', 'dark', 'system']).optional(),
        })
        .parse(req.body);
      const user = await authService.updateProfile(req.user!.id, body);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
