/**
 * Test helper: in-memory node:sqlite database with Drizzle ORM and migrations.
 *
 * Usage:
 *   import { createTestDb, getTestDb, closeTestDb } from '../helpers/db';
 *
 *   beforeEach(async () => { await createTestDb(); });
 *   afterEach(() => { closeTestDb(); });
 *
 *   // In vi.mock('@/lib/db'):
 *   getDb: () => getTestDb()
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import {
  type DatabaseSync,
  type SqliteDatabase,
  drizzleNodeSqlite,
  openSqlite,
} from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

let db: SqliteDatabase<typeof schema> | null = null;
let sqlite: DatabaseSync | null = null;

/**
 * Creates a fresh in-memory database, wraps it with Drizzle, and
 * runs all Drizzle migrations from the `drizzle/` folder.
 * Call this in `beforeEach` (or `beforeAll`) in test suites that need the DB.
 */
export async function createTestDb(): Promise<SqliteDatabase<typeof schema>> {
  // Close any previously open instance to avoid leaks between tests
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }

  sqlite = openSqlite(':memory:');
  db = drizzleNodeSqlite(sqlite, schema);
  migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });

  return db;
}

/**
 * Returns the current test database instance.
 * Throws if `createTestDb()` has not been called yet.
 */
export function getTestDb(): SqliteDatabase<typeof schema> {
  if (!db) {
    throw new Error('Test DB not initialized. Call createTestDb() first.');
  }
  return db;
}

/**
 * Closes the database and nulls all references.
 * Call this in `afterEach` (or `afterAll`).
 */
export function closeTestDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
