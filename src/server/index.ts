import * as http from "node:http";
import * as net from "node:net";
import { URL } from "node:url";
import { parseCards, CardInputError } from "../core/cards";
import { bestFromCards } from "../core/evaluator";
import { compareHoldem, PlayerInput } from "../core/holdem";
import {
  insertCase,
  saveAnalysis,
  saveParticipants,
  listCases,
  getCase,
  listAnalyses,
  getAnalysis,
  openDb,
  getDbPath,
} from "../core/db";

interface JsonError {
  error: { code: string; message: string };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("请求体过大"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}

function mapError(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof CardInputError) {
    const status = err.code === "DUPLICATE_CARD" ? 409 : 400;
    return { status, code: err.code, message: err.detail };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 400, code: "BAD_REQUEST", message };
}

function serializeBest(best: ReturnType<typeof bestFromCards>) {
  return {
    category: best.evaluation.categoryName,
    categoryCode: best.evaluation.category,
    rankVector: best.evaluation.rankVector,
    selectedCards: best.evaluation.cards.map((c) => c.code),
    tiedCombos: best.tiedCombos,
    explanation: best.evaluation.explanation,
    note: best.note,
  };
}

export function createServer(): http.Server {
  openDb();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const method = req.method ?? "GET";

      if (method === "GET" && pathname === "/health") {
        return send(res, 200, { ok: true });
      }

      if (method === "POST" && pathname === "/api/analyze") {
        const body = await readJson(req);
        const cards = parseCards(body.cards ?? []);
        if (cards.length !== 5 && cards.length !== 7) {
          throw new CardInputError("CARD_COUNT", `分析需要 5 或 7 张牌，收到 ${cards.length} 张`);
        }
        const best = bestFromCards(cards);
        return send(res, 200, { input: body.cards, result: serializeBest(best) });
      }

      if (method === "POST" && pathname === "/api/compare") {
        const body = await readJson(req);
        const players: PlayerInput[] = (body.players ?? []).map((p: any) => ({
          id: String(p.id),
          hole: p.hole ?? [],
        }));
        const result = compareHoldem(body.board ?? [], players);
        return send(res, 200, {
          board: result.board,
          winners: result.winners,
          players: result.players.map((p) => ({
            id: p.id,
            rank: p.rank,
            usedHoleCount: p.usedHoleCount,
            playedBoard: p.playedBoard,
            best: serializeBest(p.best),
          })),
        });
      }

      if (method === "POST" && pathname === "/api/import") {
        const body = await readJson(req);
        const name = typeof body.name === "string" && body.name.trim() ? body.name : `case-${Date.now()}`;
        if (body.mode === "holdem") {
          const players: PlayerInput[] = (body.players ?? []).map((p: any) => ({
            id: String(p.id),
            hole: p.hole ?? [],
          }));
          const compared = compareHoldem(body.board ?? [], players);
          const caseId = insertCase({ name, mode: "holdem", board: body.board, players: body.players });
          const snapshot = {
            board: compared.board,
            winners: compared.winners,
            players: compared.players.map((p) => ({
              id: p.id,
              rank: p.rank,
              usedHoleCount: p.usedHoleCount,
              playedBoard: p.playedBoard,
              best: serializeBest(p.best),
            })),
          };
          const analysisId = saveAnalysis(caseId, snapshot);
          saveParticipants(
            caseId,
            compared.players.map((p) => ({ id: p.id, rank: p.rank, vector: p.best.evaluation.rankVector }))
          );
          return send(res, 201, { caseId, analysisId, snapshot });
        }

        const cards = parseCards(body.cards ?? []);
        if (cards.length !== 5 && cards.length !== 7) {
          throw new CardInputError("CARD_COUNT", `导入单组牌例需要 5 或 7 张牌，收到 ${cards.length} 张`);
        }
        const best = bestFromCards(cards);
        const caseId = insertCase({ name, mode: "single", cards: body.cards });
        const snapshot = serializeBest(best);
        const analysisId = saveAnalysis(caseId, snapshot);
        return send(res, 201, { caseId, analysisId, snapshot });
      }

      if (method === "GET" && pathname === "/api/cases") {
        return send(res, 200, { cases: listCases() });
      }

      const caseMatch = pathname.match(/^\/api\/cases\/(\d+)$/);
      if (method === "GET" && caseMatch) {
        const rec = getCase(Number(caseMatch[1]));
        if (!rec) return send(res, 404, { error: { code: "NOT_FOUND", message: "牌例不存在" } } satisfies JsonError);
        return send(res, 200, rec);
      }

      if (method === "GET" && pathname === "/api/analyses") {
        const caseId = url.searchParams.get("caseId");
        return send(res, 200, { analyses: listAnalyses(caseId ? Number(caseId) : undefined) });
      }

      const analysisMatch = pathname.match(/^\/api\/analyses\/(\d+)$/);
      if (method === "GET" && analysisMatch) {
        const rec = getAnalysis(Number(analysisMatch[1]));
        if (!rec) return send(res, 404, { error: { code: "NOT_FOUND", message: "分析不存在" } } satisfies JsonError);
        return send(res, 200, { ...rec, snapshot: JSON.parse(rec.snapshot_json) });
      }

      if (method === "GET" && pathname === "/api/export") {
        return send(res, 200, {
          cases: listCases(),
          analyses: listAnalyses().map((a) => ({ ...a, snapshot: JSON.parse(a.snapshot_json) })),
        });
      }

      return send(res, 404, { error: { code: "NOT_FOUND", message: `未知路由 ${method} ${pathname}` } } satisfies JsonError);
    } catch (err) {
      const mapped = mapError(err);
      return send(res, mapped.status, { error: { code: mapped.code, message: mapped.message } } satisfies JsonError);
    }
  });
  return server;
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
  });
}

export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

if (require.main === module) {
  (async () => {
    const requested = process.env.PORT ? Number(process.env.PORT) : 0;
    const port = requested > 0 ? requested : await pickFreePort();
    const server = createServer();
    const actual = await listen(server, port);
    console.log(`扑克牌型比较服务已启动: http://127.0.0.1:${actual}`);
    console.log(`SQLite 数据库: ${getDbPath()}`);
  })().catch((err) => {
    console.error("启动失败:", err);
    process.exit(1);
  });
}
