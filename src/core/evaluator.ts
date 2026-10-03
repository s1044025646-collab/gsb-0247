import { Card, rankChar, suitChar, displayOrder, combinations } from "./cards";

// 九种牌型，编号越大牌力越强。
export enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<Category, string> = {
  [Category.HighCard]: "高牌",
  [Category.Pair]: "一对",
  [Category.TwoPair]: "两对",
  [Category.ThreeOfAKind]: "三条",
  [Category.Straight]: "顺子",
  [Category.Flush]: "同花",
  [Category.FullHouse]: "葫芦",
  [Category.FourOfAKind]: "四条",
  [Category.StraightFlush]: "同花顺",
};

/**
 * 五张牌的完整评价。
 * rankVector：用于比较的等级向量，第一项为牌型编号，其余为按比较优先级排列的点数。
 * 同类逐位比较即可判定胜负，因此天然正确处理踢脚牌、两对高低对子顺序等。
 */
export interface Evaluation {
  category: Category;
  categoryName: string;
  rankVector: number[];
  cards: Card[]; // 固定展示牌序后的五张
  explanation: string;
}

interface Group {
  rank: number;
  count: number;
}

function rankWord(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

function descRanks(cards: Card[]): number[] {
  return displayOrder(cards).map((c) => c.rank);
}

/** 返回顺子的高点（A2345 返回 5），非顺子返回 null。 */
function straightHigh(sortedDescRanks: number[]): number | null {
  const uniq = [...new Set(sortedDescRanks)].sort((a, b) => b - a);
  if (uniq.length !== 5) return null;
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  // A2345 只作为五高顺子（轮式顺子）；QKA23 等其余缺口组合一律不成立。
  if (uniq.join(",") === "14,5,4,3,2") return 5;
  return null;
}

/** 仅对恰好五张互不重复的实体牌进行分类。 */
export function evaluateFive(cards: Card[]): Evaluation {
  if (cards.length !== 5) {
    throw new Error(`evaluateFive 要求恰好 5 张牌，收到 ${cards.length} 张`);
  }
  const ordered = displayOrder(cards);
  const ranksDesc = ordered.map((c) => c.rank);

  const flush = cards.every((c) => c.suit === cards[0].suit);
  const sHigh = straightHigh(ranksDesc);
  if (flush && sHigh !== null) {
    return build(Category.StraightFlush, [Category.StraightFlush, sHigh], ordered,
      `${suitWord(cards[0].suit)}花色同花顺，${sHigh === 5 ? "A-2-3-4-5（五高）" : `${rankWord(sHigh - 4)} 到 ${rankWord(sHigh)}`}`);
  }

  const counts = new Map<number, number>();
  for (const r of ranksDesc) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups: Group[] = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    // 分组排序：张数多者优先；张数相同点数大者优先（两对、葫芦均依赖此顺序）
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const pattern = groups.map((g) => g.count).sort((a, b) => b - a).join("");

  if (pattern === "41") {
    const quad = groups[0].rank;
    const kicker = groups[1].rank;
    return build(Category.FourOfAKind, [Category.FourOfAKind, quad, kicker], ordered,
      `四条 ${rankWord(quad)}，踢脚 ${rankWord(kicker)}`);
  }
  if (pattern === "32") {
    const trip = groups[0].rank;
    const pair = groups[1].rank;
    return build(Category.FullHouse, [Category.FullHouse, trip, pair], ordered,
      `葫芦：三条 ${rankWord(trip)} + 一对 ${rankWord(pair)}`);
  }
  if (flush) {
    return build(Category.Flush, [Category.Flush, ...ranksDesc], ordered,
      `${suitWord(cards[0].suit)}同花，高点 ${rankWord(ranksDesc[0])}`);
  }
  if (sHigh !== null) {
    return build(Category.Straight, [Category.Straight, sHigh], ordered,
      `顺子，${sHigh === 5 ? "A-2-3-4-5（五高）" : `${rankWord(sHigh - 4)} 到 ${rankWord(sHigh)}`}`);
  }
  if (pattern === "311") {
    const trip = groups[0].rank;
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return build(Category.ThreeOfAKind, [Category.ThreeOfAKind, trip, ...kickers], ordered,
      `三条 ${rankWord(trip)}，踢脚 ${kickers.map(rankWord).join("、")}`);
  }
  if (pattern === "221") {
    const high = groups[0].rank;
    const low = groups[1].rank;
    const kicker = groups[2].rank;
    return build(Category.TwoPair, [Category.TwoPair, high, low, kicker], ordered,
      `两对：${rankWord(high)} 与 ${rankWord(low)}，踢脚 ${rankWord(kicker)}`);
  }
  if (pattern === "2111") {
    const pair = groups[0].rank;
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return build(Category.Pair, [Category.Pair, pair, ...kickers], ordered,
      `一对 ${rankWord(pair)}，踢脚 ${kickers.map(rankWord).join("、")}`);
  }
  return build(Category.HighCard, [Category.HighCard, ...ranksDesc], ordered,
    `高牌，高点 ${rankWord(ranksDesc[0])}`);
}

function suitWord(suit: number): string {
  return ["梅花", "方块", "红桃", "黑桃"][suit];
}

function build(category: Category, rankVector: number[], cards: Card[], explanation: string): Evaluation {
  return { category, categoryName: CATEGORY_NAMES[category], rankVector, cards, explanation };
}

/** 向量比较：a>b 返回 1，a<b 返回 -1，完全相等返回 0。 */
export function compareVectors(a: readonly number[], b: readonly number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export interface BestHand {
  evaluation: Evaluation;
  /** 该手牌所有并列最佳的五张实体组合（固定牌序编码）。 */
  tiedCombos: string[][];
  /** 展示所选用的组合下标（tiedCombos 中的位置），固定为按牌序排序后的第一份。 */
  selectedIndex: number;
  note: string;
}

/**
 * 从 5 或 7 张牌中穷举所有 C(n,5) 个子集（7 张为 21 个），
 * 选等级向量最大者；相同最大向量的实体组合全部保留，展示按固定牌序取第一份。
 * 不使用贪心分组，因此两组三条、三组对子等情形不会选错。
 */
export function bestFromCards(cards: Card[]): BestHand {
  if (cards.length !== 5 && cards.length !== 7) {
    throw new Error(`bestFromCards 仅支持 5 或 7 张牌，收到 ${cards.length} 张`);
  }
  const evals = combinations(cards.length, 5).map((idx) => {
    const combo = idx.map((i) => cards[i]);
    return { ev: evaluateFive(combo), codes: displayOrder(combo).map((c) => c.code) };
  });

  let bestCmp = -1;
  let best: typeof evals = [];
  for (const item of evals) {
    const cmp = best.length === 0 ? 1 : compareVectors(item.ev.rankVector, best[0].ev.rankVector);
    if (cmp > 0) {
      best = [item];
      bestCmp = 1;
    } else if (cmp === 0) {
      best.push(item);
    }
  }
  void bestCmp;

  // 固定牌序：先按牌型向量（相同），再按拼接后的牌编码字典序排序，保证展示确定性。
  best.sort((a, b) => {
    const ka = a.codes.join(",");
    const kb = b.codes.join(",");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const tiedCombos = best.map((b) => b.codes);
  const multiple = tiedCombos.length > 1;
  return {
    evaluation: best[0].ev,
    tiedCombos,
    selectedIndex: 0,
    note: multiple
      ? `存在 ${tiedCombos.length} 份牌力完全相同的最佳五张组合，按固定牌序展示第一份；不影响平局判断。`
      : "最佳五张组合唯一。",
  };
}

/** 便捷：比较若干已计算出的等级向量，返回从大到小的名次分组（并列同名次）。 */
export function rankPlayers(scores: { id: string; vector: number[] }[]): { rank: number; id: string }[] {
  const sorted = [...scores].sort((a, b) => compareVectors(b.vector, a.vector));
  const result: { rank: number; id: string }[] = [];
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || compareVectors(sorted[i].vector, sorted[i - 1].vector) !== 0) {
      rank = i + 1;
    }
    result.push({ rank, id: sorted[i].id });
  }
  return result;
}

export { rankChar, suitChar };
