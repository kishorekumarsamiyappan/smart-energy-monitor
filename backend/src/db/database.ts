import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export interface DatabaseClient {
  kind: 'pg' | 'pglite';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function runMigrationsOnClient(db: DatabaseClient, migrationsDir: string): Promise<void> {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }
}

export async function createDatabaseClient(options: {
  databaseUrl: string | null;
  migrationsDir?: string;
}): Promise<DatabaseClient> {
  const migrationsDir =
    options.migrationsDir || path.resolve(import.meta.dirname, '../../../database/migrations');

  if (options.databaseUrl) {
    const pool = new Pool({
      connectionString: options.databaseUrl,
      ssl: options.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    return {
      kind: 'pg',
      async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
        const res = await pool.query(sql, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
      async exec(sql: string) {
        await pool.query(sql);
      },
      async close() {
        await pool.end();
      },
    };
  }

  // Embedded PostgreSQL (PGlite) for automated tests & zero-dependency local dev verification
  const pglite = new PGlite();
  const client: DatabaseClient = {
    kind: 'pglite',
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const res = await pglite.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(sql: string) {
      await pglite.exec(sql);
    },
    async close() {
      await pglite.close();
    },
  };
  await runMigrationsOnClient(client, migrationsDir);
  return client;
}
