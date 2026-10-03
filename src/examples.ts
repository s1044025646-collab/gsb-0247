/** 内置确定性示例。 */

/** 公共牌本身就是最大牌型：所有玩家完全使用公共牌，全体并列第一。 */
export const BOARD_PLAYS_EXAMPLE = {
  board: ["As", "Ks", "Qs", "Js", "Ts"], // 公共牌即皇家同花顺
  players: [
    { name: "甲", hole: ["2c", "3d"] },
    { name: "乙", hole: ["7h", "8h"] },
  ],
};

/** 同样一对，踢脚不同：甲 A 踢脚胜乙 K 踢脚。 */
export const KICKER_EXAMPLE = {
  board: ["9h", "5c", "2d", "7s", "3c"],
  players: [
    { name: "甲", hole: ["9s", "Ah"] },
    { name: "乙", hole: ["9d", "Kh"] },
  ],
};
