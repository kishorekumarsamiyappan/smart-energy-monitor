import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserProfile, UserRole } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';
import { revokeTokenJti } from '../middleware/auth.js';

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  password_hash: string | null;
  role: UserRole;
  organization: string | null;
  avatar_url: string | null;
  theme_preference: 'light' | 'dark' | 'system';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number,
    role: row.role,
    organization: row.organization,
    avatarUrl: row.avatar_url,
    themePreference: row.theme_preference,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// In-memory reset token store (hashed token -> userId & expiry)
const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();

export class AuthService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly jwtSecret: string,
  ) {}

  private signToken(user: UserRow): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: crypto.randomUUID(),
      },
      this.jwtSecret,
      { expiresIn: '7d' },
    );
  }

  async register(input: {
    fullName: string;
    email: string;
    mobileNumber: string;
    password: string;
    organization?: string;
  }): Promise<{ user: UserProfile; token: string; verificationRequired: boolean; message: string }> {
    const emailNorm = input.email.trim().toLowerCase();
    const mobileNorm = input.mobileNumber.trim();

    const dup = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = $1 OR mobile_number = $2 LIMIT 1`,
      [emailNorm, mobileNorm],
    );
    if (dup.rows.length > 0) {
      throw new AppError(409, 'An account with this email or mobile number already exists.', 'DUPLICATE_USER');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    // Role is ALWAYS forced to 'user' on self-registration (admin promotion happens via controlled seed/admin path)
    const res = await this.db.query<UserRow>(
      `INSERT INTO users (full_name, email, mobile_number, password_hash, role, organization, email_verified)
       VALUES ($1, $2, $3, $4, 'user', $5, FALSE)
       RETURNING *`,
      [input.fullName.trim(), emailNorm, mobileNorm, passwordHash, input.organization?.trim() || null],
    );
    const created = res.rows[0];
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values)
       VALUES ($1::uuid, 'USER_REGISTERED', 'users', $1::text, $2::jsonb)`,
      [created.id, JSON.stringify({ email: emailNorm, role: 'user' })],
    );

    const token = this.signToken(created);
    return {
      user: mapUser(created),
      token,
      verificationRequired: false,
      message: 'Account created successfully.',
    };
  }

  async login(identifier: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const clean = identifier.trim();
    const res = await this.db.query<UserRow>(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR mobile_number = $1 LIMIT 1`,
      [clean],
    );
    const row = res.rows[0];
    if (!row || !row.password_hash) {
      throw new AppError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }
    if (!row.is_active) {
      throw new AppError(403, 'Account is disabled.', 'ACCOUNT_DISABLED');
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      throw new AppError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
    }

    return {
      user: mapUser(row),
      token: this.signToken(row),
    };
  }

  async logout(jti: string | undefined): Promise<void> {
    revokeTokenJti(jti);
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const res = await this.db.query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!res.rows[0]) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return mapUser(res.rows[0]);
  }

  async updateProfile(
    userId: string,
    patch: {
      fullName?: string;
      mobileNumber?: string;
      organization?: string | null;
      themePreference?: 'light' | 'dark' | 'system';
    },
  ): Promise<UserProfile> {
    const res = await this.db.query<UserRow>(
      `UPDATE users
       SET full_name = COALESCE($2, full_name),
           mobile_number = COALESCE($3, mobile_number),
           organization = COALESCE($4, organization),
           theme_preference = COALESCE($5, theme_preference)
       WHERE id = $1
       RETURNING *`,
      [
        userId,
        patch.fullName?.trim() ?? null,
        patch.mobileNumber?.trim() ?? null,
        patch.organization === undefined ? null : patch.organization,
        patch.themePreference ?? null,
      ],
    );
    if (!res.rows[0]) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return mapUser(res.rows[0]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new AppError(400, 'New password must be at least 8 characters.', 'WEAK_PASSWORD');
    }
    const res = await this.db.query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = res.rows[0];
    if (!row || !row.password_hash) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) {
      throw new AppError(401, 'Current password is incorrect.', 'INVALID_PASSWORD');
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await this.db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, newHash]);
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1::uuid, 'PASSWORD_CHANGED', 'users', $1::text)`,
      [userId],
    );
  }

  async requestPasswordReset(email: string): Promise<{ message: string; debugToken?: string }> {
    const res = await this.db.query<UserRow>(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [
      email.trim(),
    ]);
    const genericMsg =
      'If an account exists for that email, password reset instructions have been issued.';
    if (!res.rows[0]) {
      return { message: genericMsg };
    }
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    passwordResetTokens.set(tokenHash, {
      userId: res.rows[0].id,
      expiresAt: Date.now() + 30 * 60_000,
    });
    return {
      message: genericMsg,
      ...(process.env.NODE_ENV === 'test' ? { debugToken: rawToken } : {}),
    };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new AppError(400, 'New password must be at least 8 characters.', 'WEAK_PASSWORD');
    }
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
    const entry = passwordResetTokens.get(tokenHash);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new AppError(400, 'Reset token is invalid or expired.', 'INVALID_RESET_TOKEN');
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await this.db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [entry.userId, newHash]);
    passwordResetTokens.delete(tokenHash);
  }
}
