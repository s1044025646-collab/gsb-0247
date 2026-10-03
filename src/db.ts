import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const RULE_VERSION = "1.0.0";

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      cards TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER,
      kind TEXT NOT NULL,           -- 'hand' | 'compare'
      rule_version TEXT NOT NULL,
      input TEXT NOT NULL,          -- JSON 快照
      result TEXT NOT NULL,         -- JSON 快照，创建后不再修改
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER NOT NULL REFERENCES analyses(id),
      name TEXT NOT NULL,
      hole TEXT NOT NULL,
      rank INTEGER NOT NULL
    );
  `);
  return db;
}
