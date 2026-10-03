// 牌面表示与输入解析。统一公开格式：点数 + 花色，例如 "AS"（黑桃A）、"TH"（红桃10）、"9d"（方块9）。

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "CDHS"; // 梅花、方块、红桃、黑桃（固定花色序，仅用于展示去歧义）

export interface Card {
  rank: number; // 2..14（14 = A）
  suit: number; // 0..3 对应 C D H S
  code: string; // 规范化后的两位编码，如 "AS"
}

export type InputErrorCode =
  | "INVALID_CARD"
  | "DUPLICATE_CARD"
  | "CARD_COUNT"
  | "EMPTY_INPUT";

export class CardInputError extends Error {
  code: InputErrorCode;
  detail: string;
  constructor(code: InputErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "CardInputError";
    this.code = code;
    this.detail = detail;
  }
}

export function parseCard(token: string): Card {
  if (typeof token !== "string") {
    throw new CardInputError("INVALID_CARD", `非字符串牌面: ${String(token)}`);
  }
  const normalized = token.trim().toUpperCase();
  if (normalized.length !== 2) {
    throw new CardInputError("INVALID_CARD", `无法识别的牌面 "${token}"，应为两位编码，如 AS、TH、9d`);
  }
  const rankIdx = RANK_CHARS.indexOf(normalized[0]);
  const suitIdx = SUIT_CHARS.indexOf(normalized[1]);
  if (rankIdx < 0) {
    throw new CardInputError("INVALID_CARD", `牌面 "${token}" 的点数非法，合法点数为 2-9 T J Q K A`);
  }
  if (suitIdx < 0) {
    throw new CardInputError("INVALID_CARD", `牌面 "${token}" 的花色非法，合法花色为 C D H S`);
  }
  return { rank: rankIdx + 2, suit: suitIdx, code: RANK_CHARS[rankIdx] + SUIT_CHARS[suitIdx] };
}

/** 解析并校验一组牌：拒绝未知牌、重复牌；expectedCount 给出时校张数。 */
export function parseCards(tokens: readonly string[], expectedCount?: number): Card[] {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new CardInputError("EMPTY_INPUT", "未提供任何牌");
  }
  if (expectedCount !== undefined && tokens.length !== expectedCount) {
    throw new CardInputError(
      "CARD_COUNT",
      `牌的张数错误：收到 ${tokens.length} 张，应为 ${expectedCount} 张`
    );
  }
  const cards = tokens.map(parseCard);
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.code)) {
      throw new CardInputError("DUPLICATE_CARD", `出现重复的实体牌：${card.code}`);
    }
    seen.add(card.code);
  }
  return cards;
}

export function rankChar(rank: number): string {
  return RANK_CHARS[rank - 2];
}

export function suitChar(suit: number): string {
  return SUIT_CHARS[suit];
}

/** 固定展示牌序：点数降序，点数相同按固定花色序 C<D<H<S。 */
export function displayOrder(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit);
}

export function cardsToCodes(cards: Card[]): string[] {
  return displayOrder(cards).map((c) => c.code);
}

/** 组合枚举：从 n 张牌中取 k 张的全部下标组合。 */
export function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  const walk = (start: number) => {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);
  return result;
}
