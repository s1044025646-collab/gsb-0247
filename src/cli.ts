import { openDb } from "./db.js";
import { PokerService } from "./service.js";
import { createApiServer } from "./api.js";
import { BOARD_PLAYS_EXAMPLE, KICKER_EXAMPLE } from "./examples.js";
import { CardError } from "./cards.js";

const DB_PATH = process.env.POKER_DB ?? "data/poker.db";

function usage(): never {
  console.log(`用法:
  poker serve [--port N]              启动 API 服务（默认端口 0，自动选空闲端口）
  poker import <牌...> [--name N]     导入 5 或 7 张牌
  poker analyze <牌...>               分析 5 或 7 张牌
  poker analyze-hand <id>             分析已导入的牌例
  poker compare --board B1..B5 --player "名字:H1 H2" ...
  poker explain <analysisId>          查看历史分析解释
  poker export                        导出全部数据 JSON
  poker demo                          运行内置示例（公共牌成最大牌型 + 踢脚比较）`);
  process.exit(1);
}

function printCompare(r: any) {
  console.log(`公共牌: ${r.board.join(" ")}`);
  for (const p of [...r.players].sort((a: any, b: any) => a.rank - b.rank)) {
    console.log(`#${p.rank} ${p.name} 底牌[${p.hole.join(" ")}] ${p.description}`);
  }
  console.log(`注: ${r.note}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  if (!cmd) usage();

  if (cmd === "serve") {
    const portIdx = args.indexOf("--port");
    const port = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.PORT ?? 0);
    const service = new PokerService(openDb(DB_PATH));
    const server = createApiServer(service);
    server.listen(port, () => {
      const addr = server.address();
      console.log(`API 服务已启动: http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : port}`);
    });
    return;
  }

  const service = new PokerService(openDb(DB_PATH));
  try {
    switch (cmd) {
      case "import": {
        const nameIdx = args.indexOf("--name");
        const name = nameIdx >= 0 ? args.splice(nameIdx, 2)[1] : undefined;
        const r = service.importHand(name, args);
        console.log(`已导入牌例 #${r.id}: ${r.cards.join(" ")}`);
        break;
      }
      case "analyze": {
        const r = service.analyzeCards(args);
        console.log(`分析 #${r.analysisId} ${r.description}`);
        console.log(`注: ${r.note}`);
        break;
      }
      case "analyze-hand": {
        const r = service.analyzeHandById(Number(args[0]));
        console.log(`分析 #${r.analysisId} ${r.description}`);
        break;
      }
      case "compare": {
        const boardIdx = args.indexOf("--board");
        if (boardIdx < 0) usage();
        const board = args[boardIdx + 1].split(/[,\s]+/).filter(Boolean);
        const players: { name: string; hole: string[] }[] = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--player") {
            const spec = args[++i];
            const [name, rest] = spec.split(":");
            players.push({ name, hole: rest.trim().split(/[,\s]+/).filter(Boolean) });
          }
        }
        printCompare(service.compare(board, players));
        break;
      }
      case "explain": {
        const a = service.getAnalysis(Number(args[0]));
        console.log(JSON.stringify(a, null, 2));
        break;
      }
      case "export": {
        console.log(JSON.stringify(service.exportAll(), null, 2));
        break;
      }
      case "demo": {
        console.log("== 示例 1: 公共牌即最大牌型（全体并列） ==");
        printCompare(service.compare(BOARD_PLAYS_EXAMPLE.board, BOARD_PLAYS_EXAMPLE.players));
        console.log("\n== 示例 2: 同样一对，踢脚不同 ==");
        printCompare(service.compare(KICKER_EXAMPLE.board, KICKER_EXAMPLE.players));
        break;
      }
      default:
        usage();
    }
  } catch (err) {
    if (err instanceof CardError) {
      console.error(`错误 [${err.code}]: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
}

main();
