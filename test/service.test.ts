import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../dist/db.js";
import { PokerService } from "../dist/service.js";
import { BOARD_PLAYS_EXAMPLE, KICKER_EXAMPLE } from "../dist/examples.js";

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "poker-"));
  const path = join(dir, "poker.db");
  const dbs: any[] = [];
  const open = () => {
    const db = openDb(path);
    dbs.push(db);
    return db;
  };
  const cleanup = () => {
    for (const db of dbs) {
      try {
        db.close();
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  };
  return { open, cleanup };
}

test("公共牌重复冲突被拒绝且不写入成功报告", () => {
  const t = tempDb();
  const svc = new PokerService(t.open());
  assert.throws(
    () =>
      svc.compare(["As", "Ks", "Qs", "Js", "Ts"], [
        { name: "甲", hole: ["As", "2d"] },
        { name: "乙", hole: ["3c", "4d"] },
      ]),
    /重复牌/
  );
  assert.equal(svc.listAnalyses().length, 0);
  t.cleanup();
});

test("未知牌与张数错误", () => {
  const svc = new PokerService(openDb(":memory:"));
  assert.throws(() => svc.analyzeCards(["Xs", "2d", "3c", "4h", "5s"]), /未知牌/);
  assert.throws(() => svc.analyzeCards(["As", "2d", "3c"]), /需要 5 或 7 张/);
  assert.throws(() => svc.analyzeCards(["As", "As", "3c", "4h", "5s"]), /重复牌/);
});

test("大小写规范化", () => {
  const svc = new PokerService(openDb(":memory:"));
  const r = svc.analyzeCards(["aS", "ks", "QS", "jS", "ts"]);
  assert.equal(r.categoryName, "同花顺");
});

test("公共牌即最大牌型：全体并列第一", () => {
  const svc = new PokerService(openDb(":memory:"));
  const r = svc.compare(BOARD_PLAYS_EXAMPLE.board, BOARD_PLAYS_EXAMPLE.players);
  assert.ok(r.players.every((p) => p.rank === 1));
  assert.ok(r.players.every((p) => p.categoryName === "同花顺"));
});

test("踢脚示例：A 踢脚胜 K 踢脚", () => {
  const svc = new PokerService(openDb(":memory:"));
  const r = svc.compare(KICKER_EXAMPLE.board, KICKER_EXAMPLE.players);
  const jia = r.players.find((p) => p.name === "甲")!;
  const yi = r.players.find((p) => p.name === "乙")!;
  assert.equal(jia.rank, 1);
  assert.equal(yi.rank, 2);
  assert.equal(jia.categoryName, "一对");
});

test("重启后读取历史分析快照", () => {
  const t = tempDb();
  const svc1 = new PokerService(t.open());
  const a = svc1.analyzeCards(["As", "Ks", "Qs", "Js", "Ts"]);
  // 模拟重启：关闭并重新打开数据库
  const svc2 = new PokerService(t.open());
  const loaded = svc2.getAnalysis(a.analysisId);
  assert.equal(loaded.result.categoryName, "同花顺");
  assert.deepEqual(loaded.result.bestCards, ["As", "Ks", "Qs", "Js", "Ts"]);
  t.cleanup();
});

test("旧分析快照不被后续牌例修改覆盖", () => {
  const t = tempDb();
  const svc = new PokerService(t.open());
  const hand = svc.importHand("例", ["As", "Ks", "Qs", "Js", "Ts"]);
  const a1 = svc.analyzeHandById(hand.id);
  svc.analyzeCards(["2c", "3d", "4h", "5s", "7c"]); // 另一份分析
  const loaded = svc.getAnalysis(a1.analysisId);
  assert.equal(loaded.result.categoryName, "同花顺");
  t.cleanup();
});
