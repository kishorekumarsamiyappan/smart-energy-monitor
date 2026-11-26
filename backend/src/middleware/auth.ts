import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from './error-handler.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  tokenJti?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// In-memory revoked token JTIs (for immediate logout invalidation; pair with Redis in multi-node prod)
const revokedTokenIds = new Set<string>();

export function revokeTokenJti(jti: string | undefined) {
  if (jti) revokedTokenIds.add(jti);
}

export function createAuthMiddleware(db: DatabaseClient, jwtSecret: string) {
  const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError(401, 'Missing or invalid authorization token', 'UNAUTHORIZED');
      }
      const token = authHeader.slice('Bearer '.length).trim();
      const decoded = jwt.verify(token, jwtSecret) as {
        sub?: string;
        email?: string;
        role?: UserRole;
        jti?: string;
      };

      if (!decoded.sub || (decoded.jti && revokedTokenIds.has(decoded.jti))) {
        throw new AppError(401, 'Session expired or logged out', 'SESSION_REVOKED');
      }

      const res = await db.query<{
        id: string;
        email: string;
        role: UserRole;
        full_name: string;
        is_active: boolean;
      }>(
        `SELECT id, email, role, full_name, is_active FROM users WHERE id = $1 OR auth_uid = $1 LIMIT 1`,
        [decoded.sub],
      );

      const row = res.rows[0];
      if (!row || !row.is_active) {
        throw new AppError(401, 'User account is inactive or does not exist', 'UNAUTHORIZED');
      }

      req.user = {
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.full_name,
        tokenJti: decoded.jti,
      };
      next();
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError(401, 'Invalid or expired authentication token', 'UNAUTHORIZED'));
    }
  };

  const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    if (req.user.role !== 'admin') {
      next(new AppError(403, 'Administrator access required', 'FORBIDDEN'));
      return;
    }
    next();
  };

  return { requireAuth, requireAdmin };
}
