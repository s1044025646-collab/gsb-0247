import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export const RULE_VERSION = "poker-rules-v1.0.0";

let dbInstance: DatabaseSync | null = null;
let dbPath = "";

export function openDb(
  dataDir = path.join(process.env.POKER_DATA_DIR || process.cwd(), "data")
): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, "poker.db");
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      cards_json TEXT,
      board_json TEXT,
      players_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      rank INTEGER,
      vector_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      rule_version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rule_versions (
      version TEXT PRIMARY KEY,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const insRule = dbInstance.prepare(
    "INSERT OR IGNORE INTO rule_versions(version, note, created_at) VALUES (?,?,?)"
  );
  insRule.run(RULE_VERSION, "标准52张；九种牌型；A2345为五高顺子；七选五穷举21子集", new Date().toISOString());
  return dbInstance;
}

export interface CaseRecord {
  id: number;
  name: string;
  mode: "single" | "holdem";
  cards_json: string | null;
  board_json: string | null;
  players_json: string | null;
  created_at: string;
}

export interface AnalysisRecord {
  id: number;
  case_id: number;
  rule_version: string;
  snapshot_json: string;
  created_at: string;
}

export function insertCase(input: {
  name: string;
  mode: "single" | "holdem";
  cards?: string[];
  board?: string[];
  players?: { id: string; hole: string[] }[];
}): number {
  const db = openDb();
  const stmt = db.prepare(
    "INSERT INTO cases(name, mode, cards_json, board_json, players_json, created_at) VALUES (?,?,?,?,?,?)"
  );
  const info = stmt.run(
    input.name,
    input.mode,
    input.cards ? JSON.stringify(input.cards) : null,
    input.board ? JSON.stringify(input.board) : null,
    input.players ? JSON.stringify(input.players) : null,
    new Date().toISOString()
  );
  return Number(info.lastInsertRowid);
}

/** 保存不可变分析快照。快照一旦写入不再更新，之后修改牌例只会产生新快照。 */
export function saveAnalysis(caseId: number, snapshot: unknown): number {
  const db = openDb();
  const info = db
    .prepare("INSERT INTO analyses(case_id, rule_version, snapshot_json, created_at) VALUES (?,?,?,?)")
    .run(caseId, RULE_VERSION, JSON.stringify(snapshot), new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function saveParticipants(caseId: number, players: { id: string; rank: number; vector: number[] }[]): void {
  const db = openDb();
  const stmt = db.prepare(
    "INSERT INTO participants(case_id, player_id, rank, vector_json) VALUES (?,?,?,?)"
  );
  for (const p of players) stmt.run(caseId, p.id, p.rank, JSON.stringify(p.vector));
}

export function getCase(id: number): CaseRecord | undefined {
  return openDb().prepare("SELECT * FROM cases WHERE id = ?").get(id) as unknown as CaseRecord | undefined;
}

export function listCases(): CaseRecord[] {
  return openDb().prepare("SELECT * FROM cases ORDER BY id").all() as unknown as CaseRecord[];
}

export function listAnalyses(caseId?: number): AnalysisRecord[] {
  const db = openDb();
  if (caseId === undefined) {
    return db.prepare("SELECT * FROM analyses ORDER BY id").all() as unknown as AnalysisRecord[];
  }
  return db.prepare("SELECT * FROM analyses WHERE case_id = ? ORDER BY id").all(caseId) as unknown as AnalysisRecord[];
}

export function getAnalysis(id: number): AnalysisRecord | undefined {
  return openDb().prepare("SELECT * FROM analyses WHERE id = ?").get(id) as unknown as AnalysisRecord | undefined;
}

export function getDbPath(): string {
  return dbPath;
}

/** 测试/演示辅助：切换到独立内存数据库（避免污染文件数据）。 */
export function resetDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
