export const RANKS = "23456789TJQKA";
export const SUITS = "shdc"; // 固定花色顺序，仅用于确定性展示，不参与比较

export interface Card {
  rank: number; // 2..14
  suit: number; // 0..3 (s,h,d,c)
}

export class CardError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CardError";
  }
}

export function parseCard(text: string): Card {
  if (typeof text !== "string") throw new CardError("UNKNOWN_CARD", `非法牌面: ${String(text)}`);
  const t = text.trim();
  if (t.length !== 2) throw new CardError("UNKNOWN_CARD", `未知牌: ${text}`);
  const r = RANKS.indexOf(t[0].toUpperCase());
  const s = SUITS.indexOf(t[1].toLowerCase());
  if (r < 0 || s < 0) throw new CardError("UNKNOWN_CARD", `未知牌: ${text}`);
  return { rank: r + 2, suit: s };
}

export function cardToString(c: Card): string {
  return RANKS[c.rank - 2] + SUITS[c.suit];
}

export function parseCards(texts: string[]): Card[] {
  if (!Array.isArray(texts)) throw new CardError("WRONG_COUNT", "cards 必须是字符串数组");
  return texts.map(parseCard);
}

export function assertNoDuplicates(cards: Card[], context = ""): void {
  const seen = new Set<number>();
  for (const c of cards) {
    const key = c.rank * 4 + c.suit;
    if (seen.has(key)) {
      throw new CardError("DUPLICATE_CARD", `重复牌${context ? `（${context}）` : ""}: ${cardToString(c)}`);
    }
    seen.add(key);
  }
}

export function assertCount(cards: Card[], counts: number[], context = "cards"): void {
  if (!counts.includes(cards.length)) {
    throw new CardError("WRONG_COUNT", `${context} 需要 ${counts.join(" 或 ")} 张牌，实际 ${cards.length} 张`);
  }
}

/** 固定排序：点数降序，花色按 s,h,d,c。仅用于确定性展示。 */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit);
}
