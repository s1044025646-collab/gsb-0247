#!/usr/bin/env node
import { parseCards, CardInputError } from "../core/cards";
import { bestFromCards, compareVectors } from "../core/evaluator";
import { compareHoldem } from "../core/holdem";
import {
  openDb,
  insertCase,
  saveAnalysis,
  saveParticipants,
  listAnalyses,
  getDbPath,
  getAnalysis,
} from "../core/db";

function printBest(title: string, best: ReturnType<typeof bestFromCards>): void {
  console.log(`\n${title}`);
  console.log("  选中五张: " + best.evaluation.cards.map((c) => c.code).join(" "));
  console.log(`  牌型: ${best.evaluation.categoryName}   等级向量: [${best.evaluation.rankVector.join(", ")}]`);
  console.log("  解释: " + best.evaluation.explanation);
  if (best.tiedCombos.length > 1) {
    console.log("  并列最佳组合:");
    best.tiedCombos.forEach((combo, i) => console.log(`    ${i + 1}. ${combo.join(" ")}`));
  }
  console.log("  说明: " + best.note);
}

function fail(err: unknown): never {
  if (err instanceof CardInputError) {
    console.error(`错误 [${err.code}] ${err.detail}`);
  } else {
    console.error("错误:", err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
}

function parseCliCards(raw: string): string[] {
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

function cmdAnalyze(rawCards: string): void {
  const tokens = parseCliCards(rawCards);
  const cards = parseCards(tokens);
  if (cards.length !== 5 && cards.length !== 7) {
    throw new CardInputError("CARD_COUNT", `分析需要 5 或 7 张牌，收到 ${cards.length} 张`);
  }
  printBest(`分析输入: ${tokens.join(" ")}`, bestFromCards(cards));
}

function cmdCompare(boardRaw: string, playerArgs: string[]): void {
  const board = parseCliCards(boardRaw);
  const players = playerArgs.map((arg) => {
    const eq = arg.indexOf("=");
    if (eq < 0) throw new Error(`玩家参数格式应为 id=AH,KH，收到 "${arg}"`);
    return { id: arg.slice(0, eq), hole: parseCliCards(arg.slice(eq + 1)) };
  });
  const result = compareHoldem(board, players);
  console.log("\n公共牌: " + result.board.join(" "));
  for (const p of result.players) {
    printBest(`玩家 ${p.id}  名次 #${p.rank}${p.playedBoard ? "（完全使用公共牌）" : ""}`, p.best);
  }
  console.log("\n获胜者: " + result.winners.join(", "));
}

function cmdImport(rawCards: string, name: string): void {
  openDb();
  const tokens = parseCliCards(rawCards);
  const cards = parseCards(tokens);
  if (cards.length !== 5 && cards.length !== 7) {
    throw new CardInputError("CARD_COUNT", `导入需要 5 或 7 张牌，收到 ${cards.length} 张`);
  }
  const best = bestFromCards(cards);
  const caseId = insertCase({ name, mode: "single", cards: tokens });
  const analysisId = saveAnalysis(caseId, {
    category: best.evaluation.categoryName,
    rankVector: best.evaluation.rankVector,
    selectedCards: best.evaluation.cards.map((c) => c.code),
    explanation: best.evaluation.explanation,
    note: best.note,
  });
  console.log(`已导入牌例 #${caseId}，生成不可变分析快照 #${analysisId}（数据库 ${getDbPath()}）`);
}

function cmdExplain(analysisId: string): void {
  openDb();
  const rec = getAnalysis(Number(analysisId));
  if (!rec) throw new Error(`分析 #${analysisId} 不存在`);
  console.log(`分析 #${rec.id}  牌例 #${rec.case_id}  规则版本 ${rec.rule_version}  时间 ${rec.created_at}`);
  console.log(JSON.stringify(JSON.parse(rec.snapshot_json), null, 2));
}

function cmdExport(): void {
  openDb();
  const analyses = listAnalyses();
  console.log(JSON.stringify({ count: analyses.length, analyses }, null, 2));
}

/** 确定性演示：不使用随机抽样，全部为固定规则用例。 */
function cmdDemo(): void {
  openDb();
  console.log("===== 扑克牌型比较确定性演示 =====");
  console.log("数据库: " + getDbPath());

  // 用例一：公共牌本身构成最大牌型（皇家同花顺），玩家牌完全不参与 => 全体平局。
  const board = ["TH", "JH", "QH", "KH", "AH"];
  const demoPlayers = [
    { id: "甲", hole: ["2C", "3D"] },
    { id: "乙", hole: ["9S", "9C"] },
  ];
  const result = compareHoldem(board, demoPlayers);
  const caseId = insertCase({ name: "demo-皇家同花顺公共牌平局", mode: "holdem", board, players: demoPlayers });
  const snapshot = {
    board: result.board,
    winners: result.winners,
    players: result.players.map((p) => ({
      id: p.id,
      rank: p.rank,
      usedHoleCount: p.usedHoleCount,
      selectedCards: p.best.evaluation.cards.map((c) => c.code),
      category: p.best.evaluation.categoryName,
      rankVector: p.best.evaluation.rankVector,
      explanation: p.best.evaluation.explanation,
    })),
  };
  const analysisId = saveAnalysis(caseId, snapshot);
  saveParticipants(caseId, result.players.map((p) => ({ id: p.id, rank: p.rank, vector: p.best.evaluation.rankVector })));
  console.log("\n--- 用例一：公共牌即皇家同花顺，两名玩家并列第一（均完全使用公共牌）---");
  console.log("公共牌: " + result.board.join(" "));
  for (const p of result.players) {
    console.log(
      `玩家 ${p.id} 名次 #${p.rank}  选中: ${p.best.evaluation.cards.map((c) => c.code).join(" ")}  ` +
        `${p.best.evaluation.categoryName} [${p.best.evaluation.rankVector.join(",")}]`
    );
  }
  console.log("获胜者: " + result.winners.join(", ") + `（分析快照 #${analysisId}）`);

  // 用例二：同样一对，踢脚牌不同。
  const pairStrong = bestFromCards(parseCards(["KC", "KD", "QS", "JH", "9C"]));
  const pairWeak = bestFromCards(parseCards(["KS", "KH", "QC", "8D", "7S"]));
  console.log("\n--- 用例二：同样一对 K，踢脚牌不同 ---");
  printBest("对子 + 高踢脚", pairStrong);
  printBest("对子 + 低踢脚", pairWeak);
  const cmp = compareVectors(pairStrong.evaluation.rankVector, pairWeak.evaluation.rankVector);
  console.log(`比较结果: ${cmp > 0 ? "前者胜（第二踢脚 J > 8）" : cmp < 0 ? "后者胜" : "平局"}`);

  // 用例三：七张中三组对子（两对选择 + 踢脚）。
  const threePairs = bestFromCards(parseCards(["AH", "AD", "KS", "KC", "QH", "QC", "2S"]));
  printBest("七张含三组对子（应取 A、K 两对，Q 为踢脚）", threePairs);

  // 用例四：重启后读取历史分析（同一进程再次查询数据库文件，模拟重启读取）。
  console.log("\n--- 用例四：从数据库读取历史分析（重启后仍可读取，旧快照不被覆盖）---");
  const history = listAnalyses(caseId);
  const stored = history[history.length - 1];
  const parsed = JSON.parse(stored.snapshot_json);
  console.log(`读取分析 #${stored.id}（规则版本 ${stored.rule_version}），获胜者: ${parsed.winners.join(", ")}`);
  console.log("\n演示完成。所有用例均为确定性规则，未使用随机抽样。");
}

function usage(): void {
  console.log(`扑克牌型比较 CLI

用法:
  poker analyze "<牌...>"            分析 5 或 7 张牌，展示最佳五张与等级向量
  poker compare "<公共牌>" id=牌,牌 [id=牌,牌 ...]
                                     多人公共牌比较（公共牌 5 张，每人 2 张）
  poker import "<牌...>" --name 名称 导入牌例并保存不可变分析快照到 SQLite
  poker explain <分析ID>             查看指定历史分析的完整解释
  poker export                       导出全部历史分析（JSON）
  poker demo                         运行内置确定性演示

牌面格式: 点数(2-9 T J Q K A) + 花色(C D H S)，如 AS TH 9d（大小写不敏感）
示例:
  poker analyze "AH KH QH JH TH"
  poker analyze "as ks qs js ts 2c 3d"
  poker compare "TH JH QH KH AH" jia=2C,3D yi=9S,9C
`);
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "analyze":
        if (!rest[0]) throw new Error("缺少牌参数");
        return cmdAnalyze(rest[0]);
      case "compare": {
        if (!rest[0] || rest.length < 2) throw new Error("用法: compare <公共牌> id=牌,牌 ...");
        return cmdCompare(rest[0], rest.slice(1));
      }
      case "import": {
        const nameIdx = rest.indexOf("--name");
        const name = nameIdx >= 0 ? rest[nameIdx + 1] : `case-${Date.now()}`;
        const cardsArg = rest.find((a, i) => a !== "--name" && i !== nameIdx + 1 && !a.startsWith("--"));
        if (!cardsArg) throw new Error("缺少牌参数");
        return cmdImport(cardsArg, name);
      }
      case "explain":
        if (!rest[0]) throw new Error("缺少分析ID");
        return cmdExplain(rest[0]);
      case "export":
        return cmdExport();
      case "demo":
        return cmdDemo();
      default:
        usage();
    }
  } catch (err) {
    fail(err);
  }
}

main(process.argv.slice(2));
