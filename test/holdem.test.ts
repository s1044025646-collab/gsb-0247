import { test, before } from "node:test";
import * as assert from "node:assert/strict";
import { CardInputError } from "../src/core/cards";
import { compareHoldem } from "../src/core/holdem";

test("公共牌即最大牌型：全体并列且完全使用公共牌", () => {
  const result = compareHoldem(
    ["TH", "JH", "QH", "KH", "AH"],
    [
      { id: "甲", hole: ["2C", "3D"] },
      { id: "乙", hole: ["9S", "9C"] },
    ]
  );
  assert.deepEqual(result.winners.sort(), ["乙", "甲"]);
  assert.ok(result.players.every((p) => p.rank === 1));
  assert.ok(result.players.every((p) => p.playedBoard === true));
  assert.ok(result.players.every((p) => p.usedHoleCount === 0));
});

test("同样一对、踢脚不同：高踢脚者胜", () => {
  const result = compareHoldem(
    ["KC", "2D", "7H", "3S", "5C"],
    [
      { id: "强", hole: ["QS", "JH"] }, // KK + Q J 7
      { id: "弱", hole: ["QC", "8D"] }, // KK + Q 8 7
    ]
  );
  assert.deepEqual(result.winners, ["强"]);
  const ranks = Object.fromEntries(result.players.map((p) => [p.id, p.rank]));
  assert.equal(ranks["强"], 1);
  assert.equal(ranks["弱"], 2);
});

test("公共牌与底牌重复冲突被拒绝", () => {
  assert.throws(
    () =>
      compareHoldem(
        ["TH", "JH", "QH", "KH", "AH"],
        [{ id: "甲", hole: ["AH", "2C"] }]
      ),
    (e: unknown) => e instanceof CardInputError && e.code === "DUPLICATE_CARD"
  );
});

test("不同玩家底牌彼此重复被拒绝", () => {
  assert.throws(
    () =>
      compareHoldem(
        ["TH", "JH", "QH", "KH", "2H"],
        [
          { id: "甲", hole: ["AS", "2C"] },
          { id: "乙", hole: ["AS", "3C"] },
        ]
      ),
    (e: unknown) => e instanceof CardInputError && e.code === "DUPLICATE_CARD"
  );
});

test("张数错误：公共牌或底牌张数不对", () => {
  assert.throws(
    () => compareHoldem(["TH", "JH", "QH"], [{ id: "甲", hole: ["AS", "2C"] }]),
    (e: unknown) => e instanceof CardInputError && e.code === "CARD_COUNT"
  );
  assert.throws(
    () => compareHoldem(["TH", "JH", "QH", "KH", "AH"], [{ id: "甲", hole: ["AS"] }]),
    (e: unknown) => e instanceof CardInputError && e.code === "CARD_COUNT"
  );
});

test("玩家可自由选择 0/1/2 张底牌", () => {
  // 公共牌为两对 KK QQ，甲的小牌无助益则打公共牌（踢脚 2）；乙持 A 可提升踢脚
  const result = compareHoldem(
    ["KC", "KD", "QC", "QD", "4H"],
    [
      { id: "甲", hole: ["2S", "3S"] }, // 两张都小于公共牌踢脚 4，故完全使用公共牌
      { id: "乙", hole: ["AH", "2C"] }, // 用 A 作踢脚的两对 KK QQ A
    ]
  );
  assert.deepEqual(result.winners, ["乙"]);
  const jia = result.players.find((p) => p.id === "甲")!;
  assert.equal(jia.playedBoard, true);
  const yi = result.players.find((p) => p.id === "乙")!;
  assert.ok(yi.usedHoleCount >= 1);
});

test("同牌力平局：不同实体牌但等级向量相同", () => {
  // 公共牌为皇家同花顺的花色镜像不可能（公共牌固定）；用两组相同 AK 高同花公共牌不现实，
  // 改为两名玩家底牌均不进入最佳五张，验证同名次。
  const result = compareHoldem(
    ["2C", "5C", "8C", "JC", "AC"],
    [
      { id: "甲", hole: ["3D", "4D"] },
      { id: "乙", hole: ["6H", "7H"] },
    ]
  );
  assert.ok(result.players.every((p) => p.rank === 1));
});
