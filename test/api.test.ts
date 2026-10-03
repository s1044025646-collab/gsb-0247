import { test, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resetDb } from "../src/core/db";
import { createServer, pickFreePort } from "../src/server/index";
import type { Server } from "node:http";

let base: string;
let server: Server;

async function call(method: string, pathname: string, body?: unknown) {
  const res = await fetch(base + pathname, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

before(async () => {
  process.env.POKER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "poker-api-"));
  resetDb();
  server = createServer();
  const port = await pickFreePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${port}`;
});

test("健康检查", async () => {
  const { status, json } = await call("GET", "/health");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test("分析七张牌并返回等级向量", async () => {
  const { status, json } = await call("POST", "/api/analyze", {
    cards: ["7C", "7D", "7H", "KS", "KC", "KD", "2S"],
  });
  assert.equal(status, 200);
  assert.equal(json.result.category, "葫芦");
  assert.deepEqual(json.result.rankVector, [6, 13, 7]);
});

test("重复牌返回 409 且为 DUPLICATE_CARD", async () => {
  const { status, json } = await call("POST", "/api/analyze", {
    cards: ["AS", "AS", "KS", "QS", "JS"],
  });
  assert.equal(status, 409);
  assert.equal(json.error.code, "DUPLICATE_CARD");
});

test("未知牌返回 400", async () => {
  const { status, json } = await call("POST", "/api/analyze", { cards: ["1S"] });
  assert.equal(status, 400);
  assert.equal(json.error.code, "INVALID_CARD");
});

test("导入 -> 列表 -> 读取分析 -> 导出 全链路", async () => {
  const imported = await call("POST", "/api/import", {
    name: "api-test",
    cards: ["TH", "JH", "QH", "KH", "AH"],
  });
  assert.equal(imported.status, 201);
  const caseId = imported.json.caseId;

  const list = await call("GET", "/api/cases");
  assert.ok(list.json.cases.some((c: { id: number }) => c.id === caseId));

  const one = await call("GET", `/api/analyses?caseId=${caseId}`);
  assert.equal(one.json.analyses.length, 1);

  const exported = await call("GET", "/api/export");
  assert.ok(exported.json.analyses.length >= 1);
});

test("多人比较：皇家同花顺公共牌平局", async () => {
  const { status, json } = await call("POST", "/api/compare", {
    board: ["TH", "JH", "QH", "KH", "AH"],
    players: [
      { id: "甲", hole: ["2C", "3D"] },
      { id: "乙", hole: ["9S", "9C"] },
    ],
  });
  assert.equal(status, 200);
  assert.deepEqual(json.winners.sort(), ["乙", "甲"]);
  assert.ok(json.players.every((p: { rank: number }) => p.rank === 1));
});

test("未知路由返回 404", async () => {
  const { status } = await call("GET", "/nope");
  assert.equal(status, 404);
});

after(() => {
  server.close();
});
