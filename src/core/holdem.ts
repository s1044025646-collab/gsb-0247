import { Card, parseCards, CardInputError, cardsToCodes } from "./cards";
import { BestHand, bestFromCards, compareVectors } from "./evaluator";

export interface PlayerInput {
  id: string;
  hole: string[]; // 恰好两张底牌
}

export interface PlayerResult {
  id: string;
  rank: number; // 并列同名次
  best: BestHand;
  usedHoleCount: number; // 选中展示的五张中使用的底牌数（允许为 0：完全使用公共牌）
  playedBoard: boolean;
}

export interface HoldemResult {
  board: string[];
  players: PlayerResult[];
  winners: string[];
}

/**
 * 多名玩家：每人两张底牌 + 五张公共牌。
 * 所有底牌与公共牌整体不得重复（实体牌唯一性）。
 * 明确允许玩家以 0、1、2 张底牌组成最佳五张（0 即完全使用公共牌）。
 */
export function compareHoldem(boardTokens: string[], playerInputs: PlayerInput[]): HoldemResult {
  if (!Array.isArray(boardTokens)) {
    throw new CardInputError("EMPTY_INPUT", "未提供公共牌");
  }
  if (boardTokens.length !== 5) {
    throw new CardInputError("CARD_COUNT", `公共牌必须恰好 5 张，收到 ${boardTokens.length} 张`);
  }
  if (!Array.isArray(playerInputs) || playerInputs.length === 0) {
    throw new CardInputError("EMPTY_INPUT", "至少需要一名玩家");
  }

  const seen = new Set<string>();
  const claim = (card: Card, owner: string) => {
    if (seen.has(card.code)) {
      throw new CardInputError(
        "DUPLICATE_CARD",
        `实体牌 ${card.code} 在公共牌或多名玩家之间重复（${owner}）`
      );
    }
    seen.add(card.code);
  };

  const board = parseCards(boardTokens, 5);
  board.forEach((c) => claim(c, "公共牌"));

  const parsedPlayers = playerInputs.map((p) => {
    if (!p || typeof p.id !== "string" || p.id.trim() === "") {
      throw new CardInputError("INVALID_CARD", "每名玩家必须提供非空 id");
    }
    const hole = parseCards(p.hole, 2);
    hole.forEach((c) => claim(c, `玩家 ${p.id}`));
    return { id: p.id, hole };
  });

  const scored = parsedPlayers.map((p) => {
    const seven = [...board, ...p.hole];
    const best = bestFromCards(seven);
    const boardSet = new Set(board.map((c) => c.code));
    const usedHoleCount = best.evaluation.cards.filter((c) => !boardSet.has(c.code)).length;
    return { id: p.id, best, usedHoleCount, vector: best.evaluation.rankVector };
  });

  const order = [...scored].sort((a, b) => compareVectors(b.vector, a.vector));
  const topVector = order[0].vector;
  const ranks = new Map<string, number>();
  order.forEach((p, i) => {
    const rank = i === 0 || compareVectors(p.vector, order[i - 1].vector) !== 0 ? i + 1 : ranks.get(order[i - 1].id)!;
    ranks.set(p.id, rank);
  });

  const players: PlayerResult[] = scored
    .map((p) => ({
      id: p.id,
      rank: ranks.get(p.id)!,
      best: p.best,
      usedHoleCount: p.usedHoleCount,
      playedBoard: p.usedHoleCount === 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  return {
    board: cardsToCodes(board),
    players,
    winners: players.filter((p) => p.rank === 1).map((p) => p.id),
  };
}
