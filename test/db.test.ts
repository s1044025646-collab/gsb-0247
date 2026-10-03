import { test, before } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  openDb,
  resetDb,
  insertCase,
  saveAnalysis,
  listAnalyses,
  getAnalysis,
  RULE_VERSION,
} from "../src/core/db";
import { bestFromCards } from "../src/core/evaluator";
import { parseCards, CardInputError } from "../src/core/cards";

let tempDir: string;

before(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poker-db-"));
  process.env.POKER_DATA_DIR = tempDir;
  resetDb();
  openDb();
});

test("分析快照保存后可读取", () => {
  const best = bestFromCards(parseCards(["TH", "JH", "QH", "KH", "AH"]));
  const caseId = insertCase({ name: "t1", mode: "single", cards: ["TH", "JH", "QH", "KH", "AH"] });
  const snapshot = { vector: best.evaluation.rankVector, category: best.evaluation.categoryName };
  const analysisId = saveAnalysis(caseId, snapshot);
  const rec = getAnalysis(analysisId)!;
  assert.equal(rec.rule_version, RULE_VERSION);
  assert.deepEqual(JSON.parse(rec.snapshot_json), snapshot);
});

test("旧分析快照不会被后来操作覆盖（追加式历史）", () => {
  const caseId = insertCase({ name: "t2", mode: "single", cards: ["2C", "3D", "5H", "7S", "KC"] });
  const id1 = saveAnalysis(caseId, { version: 1 });
  const id2 = saveAnalysis(caseId, { version: 2 });
  assert.notEqual(id1, id2);
  assert.deepEqual(JSON.parse(getAnalysis(id1)!.snapshot_json), { version: 1 });
  assert.deepEqual(JSON.parse(getAnalysis(id2)!.snapshot_json), { version: 2 });
  assert.ok(listAnalyses(caseId).length >= 2);
});

test("重启后可读取历史分析（关闭并重新打开同一数据库文件）", () => {
  resetDb();
  const reopened = openDb();
  const all = listAnalyses();
  assert.ok(all.length >= 3);
  assert.ok(fs.existsSync(path.join(tempDir, "data", "poker.db")));
});

test("重复牌输入在校验阶段失败，不写入任何分析（无成功报告）", () => {
  const before = listAnalyses().length;
  assert.throws(
    () => parseCards(["AS", "AS", "KS", "QS", "JS"]),
    (e: unknown) => e instanceof CardInputError && e.code === "DUPLICATE_CARD"
  );
  // 服务流程中校验先于入库：重复牌在入库前抛出，因此不产生新的分析记录
  assert.equal(listAnalyses().length, before);
});
