import { Card, cardToString, sortCards } from "./cards.js";

export const CATEGORY_NAMES = [
  "高牌",
  "一对",
  "两对",
  "三条",
  "顺子",
  "同花",
  "葫芦",
  "四条",
  "同花顺",
] as const;

export interface EvalResult {
  category: number; // 0..8
  categoryName: string;
  /** 比较向量：先比 category，再逐项比 vector，花色不参与。 */
  vector: number[];
}

/** 评估恰好五张牌的牌型。 */
export function evaluate5(cards: Card[]): EvalResult {
  if (cards.length !== 5) throw new Error("evaluate5 需要恰好 5 张牌");
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // 按 (张数 desc, 点数 desc) 排列的点数序列，天然处理踢脚与两对顺序
  const grouped = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .flatMap(([rank, count]) => Array<number>(count).fill(rank));

  const unique = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5) straightHigh = 5; // A2345 轮子
  }

  let category: number;
  let vector: number[];
  if (flush && straightHigh) {
    category = 8;
    vector = [straightHigh];
  } else if (grouped[0] === grouped[3]) {
    category = 7; // 四条
    vector = grouped;
  } else if (grouped[0] === grouped[2] && grouped[3] === grouped[4]) {
    category = 6; // 葫芦
    vector = grouped;
  } else if (flush) {
    category = 5;
    vector = ranks;
  } else if (straightHigh) {
    category = 4;
    vector = [straightHigh];
  } else if (grouped[0] === grouped[2]) {
    category = 3; // 三条
    vector = grouped;
  } else if (grouped[0] === grouped[1] && grouped[2] === grouped[3]) {
    category = 2; // 两对
    vector = grouped;
  } else if (grouped[0] === grouped[1]) {
    category = 1; // 一对
    vector = grouped;
  } else {
    category = 0;
    vector = ranks;
  }
  return { category, categoryName: CATEGORY_NAMES[category], vector };
}

/** 比较两个评估结果：>0 表示 a 更强，<0 表示 b 更强，0 平局。 */
export function compareEval(a: EvalResult, b: EvalResult): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.vector.length, b.vector.length);
  for (let i = 0; i < len; i++) {
    const d = (a.vector[i] ?? 0) - (b.vector[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface BestHand extends EvalResult {
  cards: Card[]; // 选中的五张牌（固定顺序）
}

/**
 * 从 5~7 张牌中枚举所有五张子集，选出最优组合。
 * 并列时保留按固定牌序的第一份（确定性展示，不影响平局判断）。
 */
export function bestOf(cards: Card[]): BestHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`bestOf 需要 5~7 张牌，实际 ${cards.length}`);
  }
  const sorted = sortCards(cards);
  let best: BestHand | null = null;
  const n = sorted.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const combo = [sorted[a], sorted[b], sorted[c], sorted[d], sorted[e]];
            const ev = evaluate5(combo);
            if (!best || compareEval(ev, best) > 0) {
              best = { ...ev, cards: combo };
            }
          }
  return best!;
}

export function describeBest(best: BestHand): string {
  const cards = best.cards.map(cardToString).join(" ");
  return `最佳五张: [${cards}] 牌型: ${best.categoryName} 等级向量: [${best.category}, ${best.vector.join(", ")}]`;
}
