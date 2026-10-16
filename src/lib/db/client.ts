import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm';
import { BetterSQLiteSession } from 'drizzle-orm/better-sqlite3/session';
import { BaseSQLiteDatabase, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';

export type { DatabaseSync };

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export type SqliteDatabase<TSchema extends Record<string, unknown>> = BaseSQLiteDatabase<
  'sync',
  RunResult,
  TSchema
>;

/** Loaded at runtime: Vite's builtin list predates node:sqlite and would try to bundle it. */
export function openSqlite(file: string): DatabaseSync {
  const { DatabaseSync: Database } = process.getBuiltinModule(
    'node:sqlite'
  ) as typeof import('node:sqlite');
  return new Database(file);
}

function rows(stmt: StatementSync, arrays: boolean, params: SQLInputValue[], one: boolean) {
  stmt.setReturnArrays(arrays);
  return one ? stmt.get(...params) : stmt.all(...params);
}

/** The slice of better-sqlite3's API that Drizzle's better-sqlite3 session calls. */
function betterSqliteFacade(sqlite: DatabaseSync) {
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query);
      return {
        run: (...params: SQLInputValue[]) => stmt.run(...params),
        all: (...params: SQLInputValue[]) => rows(stmt, false, params, false),
        get: (...params: SQLInputValue[]) => rows(stmt, false, params, true),
        raw: () => ({
          all: (...params: SQLInputValue[]) => rows(stmt, true, params, false),
          get: (...params: SQLInputValue[]) => rows(stmt, true, params, true),
        }),
      };
    },
    transaction<A extends unknown[], R>(fn: (...args: A) => R) {
      const begin =
        (mode: string) =>
        (...args: A): R => {
          sqlite.exec(`BEGIN ${mode}`);
          try {
            const result = fn(...args);
            sqlite.exec('COMMIT');
            return result;
          } catch (err) {
            if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
            throw err;
          }
        };
      return {
        deferred: begin('DEFERRED'),
        immediate: begin('IMMEDIATE'),
        exclusive: begin('EXCLUSIVE'),
      };
    },
  };
}

/** Drizzle over node:sqlite, through the better-sqlite3 session without the native module. */
export function drizzleNodeSqlite<TSchema extends Record<string, unknown>>(
  sqlite: DatabaseSync,
  fullSchema: TSchema
): SqliteDatabase<TSchema> {
  const dialect = new SQLiteSyncDialect();
  const tables = extractTablesRelationalConfig(fullSchema, createTableRelationsHelpers);
  const schema = { fullSchema, schema: tables.tables, tableNamesMap: tables.tableNamesMap };
  const session = new BetterSQLiteSession(betterSqliteFacade(sqlite) as never, dialect, schema);
  return new BaseSQLiteDatabase('sync', dialect, session, schema) as SqliteDatabase<TSchema>;
}
