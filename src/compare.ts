import { Card, CardError, parseCards, assertNoDuplicates, assertCount, cardToString } from "./cards.js";
import { BestHand, bestOf, compareEval, describeBest } from "./evaluate.js";

export interface PlayerInput {
  name: string;
  hole: string[];
}

export interface PlayerResult {
  name: string;
  hole: string[];
  best: BestHand;
  rank: number; // 并列同名次
  description: string;
}

export interface CompareResult {
  board: string[];
  players: PlayerResult[];
  note: string;
}

/**
 * 多名玩家两张底牌 + 五张公共牌比较。
 * 允许玩家完全使用五张公共牌（底牌不进最佳组合即自动体现）。
 */
export function comparePlayers(boardTexts: string[], players: PlayerInput[]): CompareResult {
  const board = parseCards(boardTexts);
  assertCount(board, [5], "公共牌");
  if (!Array.isArray(players) || players.length < 2) {
    throw new CardError("VALIDATION", "至少需要 2 名玩家");
  }
  const holes: Card[][] = players.map((p) => {
    const h = parseCards(p.hole);
    assertCount(h, [2], `玩家 ${p.name} 的底牌`);
    return h;
  });
  // 整体查重：公共牌 + 所有底牌
  assertNoDuplicates([...board, ...holes.flat()], "公共牌与底牌");

  const evaluated = players.map((p, i) => {
    const best = bestOf([...board, ...holes[i]]);
    return { name: p.name, hole: holes[i], best };
  });

  // 排名：按牌力降序，并列同名次
  const order = evaluated
    .map((e, i) => i)
    .sort((a, b) => compareEval(evaluated[b].best, evaluated[a].best));
  const ranks = new Array<number>(players.length).fill(0);
  let currentRank = 0;
  for (let pos = 0; pos < order.length; pos++) {
    if (pos === 0 || compareEval(evaluated[order[pos]].best, evaluated[order[pos - 1]].best) !== 0) {
      currentRank = pos + 1;
    }
    ranks[order[pos]] = currentRank;
  }

  return {
    board: boardTexts.map((t) => cardToString(parseCards([t])[0])),
    players: evaluated.map((e, i) => ({
      name: e.name,
      hole: e.hole.map(cardToString),
      best: e.best,
      rank: ranks[i],
      description: describeBest(e.best),
    })),
    note: "相同牌力的最佳实体组合可能不止一个，此处按固定牌序展示一份，不影响平局判断。",
  };
}
