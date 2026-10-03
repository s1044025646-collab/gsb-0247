import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { PokerService } from "./service.js";
import { CardError } from "./cards.js";

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new CardError("VALIDATION", "请求体不是合法 JSON");
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

export function createApiServer(service: PokerService) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/api/health") {
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && path === "/api/hands/import") {
        const body = await readBody(req);
        return send(res, 200, service.importHand(body.name, body.cards));
      }
      if (req.method === "GET" && path === "/api/hands") {
        return send(res, 200, service.listHands());
      }
      if (req.method === "POST" && path === "/api/analyze") {
        const body = await readBody(req);
        if (body.handId != null) return send(res, 200, service.analyzeHandById(Number(body.handId)));
        return send(res, 200, service.analyzeCards(body.cards));
      }
      if (req.method === "POST" && path === "/api/compare") {
        const body = await readBody(req);
        return send(res, 200, service.compare(body.board, body.players));
      }
      const m = path.match(/^\/api\/analyses\/(\d+)$/);
      if (req.method === "GET" && m) {
        return send(res, 200, service.getAnalysis(Number(m[1])));
      }
      if (req.method === "GET" && path === "/api/analyses") {
        return send(res, 200, service.listAnalyses());
      }
      if (req.method === "GET" && path === "/api/export") {
        return send(res, 200, service.exportAll());
      }
      send(res, 404, { error: { code: "NOT_FOUND", message: `未知路由: ${req.method} ${path}` } });
    } catch (err) {
      if (err instanceof CardError) {
        send(res, 400, { error: { code: err.code, message: err.message } });
      } else {
        send(res, 500, { error: { code: "INTERNAL", message: String(err) } });
      }
    }
  });
}
