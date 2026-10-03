import { DatabaseSync } from "node:sqlite";
import { CardError, parseCards, assertNoDuplicates, assertCount, cardToString, sortCards } from "./cards.js";
import { bestOf, describeBest } from "./evaluate.js";
import { comparePlayers, CompareResult, PlayerInput } from "./compare.js";
import { RULE_VERSION } from "./db.js";

/** 服务层：校验 -> 分析 -> 持久化快照。 */
export class PokerService {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  importHand(name: string | undefined, cardTexts: string[]) {
    const cards = parseCards(cardTexts);
    assertCount(cards, [5, 7], "导入牌例");
    assertNoDuplicates(cards, "导入牌例");
    const normalized = sortCards(cards).map(cardToString);
    const res = this.db
      .prepare("INSERT INTO hands (name, cards) VALUES (?, ?)")
      .run(name ?? null, JSON.stringify(normalized));
    return { id: Number(res.lastInsertRowid), name: name ?? null, cards: normalized };
  }

  listHands() {
    return this.db
      .prepare("SELECT id, name, cards, created_at FROM hands ORDER BY id")
      .all()
      .map((r: any) => ({ ...r, cards: JSON.parse(r.cards) }));
  }

  getHand(id: number) {
    const row = this.db.prepare("SELECT * FROM hands WHERE id = ?").get(id) as any;
    if (!row) throw new CardError("NOT_FOUND", `牌例不存在: ${id}`);
    return { ...row, cards: JSON.parse(row.cards) };
  }

  /** 分析一手 5 或 7 张牌，写入不可变分析快照。 */
  analyzeCards(cardTexts: string[], handId?: number) {
    const cards = parseCards(cardTexts);
    assertCount(cards, [5, 7], "分析牌例");
    assertNoDuplicates(cards, "分析牌例");
    const best = bestOf(cards);
    const result = {
      ruleVersion: RULE_VERSION,
      input: cardTexts,
      bestCards: best.cards.map(cardToString),
      category: best.category,
      categoryName: best.categoryName,
      vector: [best.category, ...best.vector],
      description: describeBest(best),
      note: "相同牌力的最佳实体组合可能不止一个，此处按固定牌序展示一份，不影响平局判断。",
    };
    const res = this.db
      .prepare("INSERT INTO analyses (hand_id, kind, rule_version, input, result) VALUES (?, 'hand', ?, ?, ?)")
      .run(handId ?? null, RULE_VERSION, JSON.stringify(cardTexts), JSON.stringify(result));
    return { analysisId: Number(res.lastInsertRowid), ...result };
  }

  analyzeHandById(handId: number) {
    const hand = this.getHand(handId);
    return this.analyzeCards(hand.cards, handId);
  }

  /** 多人比较：公共牌 5 张 + 每人 2 张底牌，整体查重，写入快照与参与者名次。 */
  compare(boardTexts: string[], players: PlayerInput[]) {
    const cmp: CompareResult = comparePlayers(boardTexts, players);
    const result = {
      ruleVersion: RULE_VERSION,
      board: cmp.board,
      players: cmp.players.map((p) => ({
        name: p.name,
        hole: p.hole,
        rank: p.rank,
        bestCards: p.best.cards.map(cardToString),
        categoryName: p.best.categoryName,
        vector: [p.best.category, ...p.best.vector],
        description: p.description,
      })),
      note: cmp.note,
    };
    const input = { board: boardTexts, players: players.map((p) => ({ name: p.name, hole: p.hole })) };
    const res = this.db
      .prepare("INSERT INTO analyses (hand_id, kind, rule_version, input, result) VALUES (NULL, 'compare', ?, ?, ?)")
      .run(RULE_VERSION, JSON.stringify(input), JSON.stringify(result));
    const analysisId = Number(res.lastInsertRowid);
    const insertP = this.db.prepare(
      "INSERT INTO participants (analysis_id, name, hole, rank) VALUES (?, ?, ?, ?)"
    );
    for (const p of result.players) insertP.run(analysisId, p.name, JSON.stringify(p.hole), p.rank);
    return { analysisId, ...result };
  }

  /** 读取历史分析快照（含重启后）。 */
  getAnalysis(id: number) {
    const row = this.db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as any;
    if (!row) throw new CardError("NOT_FOUND", `分析不存在: ${id}`);
    return {
      id: row.id,
      kind: row.kind,
      ruleVersion: row.rule_version,
      createdAt: row.created_at,
      input: JSON.parse(row.input),
      result: JSON.parse(row.result),
    };
  }

  listAnalyses() {
    return this.db
      .prepare("SELECT id, kind, rule_version, created_at FROM analyses ORDER BY id")
      .all();
  }

  exportAll() {
    return {
      ruleVersion: RULE_VERSION,
      hands: this.listHands(),
      analyses: this.db
        .prepare("SELECT * FROM analyses ORDER BY id")
        .all()
        .map((r: any) => ({
          id: r.id,
          kind: r.kind,
          ruleVersion: r.rule_version,
          createdAt: r.created_at,
          input: JSON.parse(r.input),
          result: JSON.parse(r.result),
        })),
      participants: this.db
        .prepare("SELECT * FROM participants ORDER BY id")
        .all()
        .map((r: any) => ({ ...r, hole: JSON.parse(r.hole) })),
    };
  }
}
