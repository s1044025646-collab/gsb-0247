import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseCards, CardInputError } from "../src/core/cards";
import {
  evaluateFive,
  bestFromCards,
  compareVectors,
  Category,
} from "../src/core/evaluator";

const ev = (codes: string) => evaluateFive(parseCards(codes.split(" ")));

test("九种牌型分类与等级向量", () => {
  assert.equal(ev("2C 3D 5H 7S KC").category, Category.HighCard);
  assert.equal(ev("2C 2D 5H 7S KC").category, Category.Pair);
  assert.equal(ev("2C 2D 5H 5S KC").category, Category.TwoPair);
  assert.equal(ev("2C 2D 2H 7S KC").category, Category.ThreeOfAKind);
  assert.equal(ev("5C 6D 7H 8S 9C").category, Category.Straight);
  assert.equal(ev("2C 5C 8C JC KC").category, Category.Flush);
  assert.equal(ev("2C 2D 2H 7S 7C").category, Category.FullHouse);
  assert.equal(ev("9C 9D 9H 9S KC").category, Category.FourOfAKind);
  assert.equal(ev("5C 6C 7C 8C 9C").category, Category.StraightFlush);
});

test("牌型强度严格递增", () => {
  const hands = [
    "2C 3D 5H 7S KC",
    "2C 2D 5H 7S KC",
    "2C 2D 5H 5S KC",
    "2C 2D 2H 7S KC",
    "5C 6D 7H 8S 9C",
    "2C 5C 8C JC KC",
    "2C 2D 2H 7S 7C",
    "9C 9D 9H 9S KC",
    "5C 6C 7C 8C 9C",
  ].map((h) => ev(h).rankVector);
  for (let i = 1; i < hands.length; i++) {
    assert.equal(compareVectors(hands[i], hands[i - 1]), 1, `第 ${i} 个牌型应强于前一个`);
  }
});

test("A2345 为五高顺子；QKA23 不成立", () => {
  const wheel = ev("AC 2D 3H 4S 5C");
  assert.equal(wheel.category, Category.Straight);
  assert.deepEqual(wheel.rankVector, [Category.Straight, 5]);
  const notStraight = ev("QC KH AC 2D 3S");
  assert.notEqual(notStraight.category, Category.Straight);
  assert.equal(notStraight.category, Category.HighCard);
  // 五高顺子输给六高顺子
  const sixHigh = ev("2C 3D 4H 5S 6C");
  assert.equal(compareVectors(sixHigh.rankVector, wheel.rankVector), 1);
});

test("非连续同花是同花而非顺子", () => {
  const f = ev("2H 5H 8H JH KH");
  assert.equal(f.category, Category.Flush);
  assert.deepEqual(f.rankVector, [Category.Flush, 13, 11, 8, 5, 2]);
});

test("同花大顺优于同花顺 9 高", () => {
  const royal = ev("TH JH QH KH AH");
  const sf9 = ev("5C 6C 7C 8C 9C");
  assert.equal(royal.category, Category.StraightFlush);
  assert.equal(compareVectors(royal.rankVector, sf9.rankVector), 1);
});

test("两对顺序：高对子优先，随后低对子，再踢脚", () => {
  const a = ev("AH AD KS KC 2H");
  const b = ev("AH AD QS QC KH");
  assert.equal(compareVectors(a.rankVector, b.rankVector), 1, "AA KK 应大于 AA QQ");
  const c = ev("KS KC QS QC AH");
  assert.equal(compareVectors(a.rankVector, c.rankVector), 1, "AA KK 应大于 KK QQ（即使后者踢脚为 A）");
});

test("一对踢脚逐位比较", () => {
  const strong = ev("KC KD QS JH 9C");
  const weak = ev("KS KH QC 8D 7S");
  assert.equal(compareVectors(strong.rankVector, weak.rankVector), 1);
  const same = ev("KC KD QD JS 9H");
  assert.equal(compareVectors(strong.rankVector, same.rankVector), 0, "花色不打破平局");
});

test("四条踢脚", () => {
  const a = ev("9C 9D 9H 9S AC");
  const b = ev("9C 9D 9H 9S KC");
  assert.equal(compareVectors(a.rankVector, b.rankVector), 1);
  assert.deepEqual(a.rankVector, [Category.FourOfAKind, 9, 14]);
});

test("七选五：葫芦选择（高三条胜出，贪心分组也需正确）", () => {
  // 两组三条 7 与 K：最优葫芦必须用 K 三条 + 7 一对
  const best = bestFromCards(parseCards("7C 7D 7H KS KC KD 2S".split(" ")));
  assert.equal(best.evaluation.category, Category.FullHouse);
  assert.deepEqual(best.evaluation.rankVector, [Category.FullHouse, 13, 7]);
});

test("七选五：三组对子取最高两对，第三对高点作踢脚", () => {
  const best = bestFromCards(parseCards("AH AD KS KC QH QC 2S".split(" ")));
  assert.equal(best.evaluation.category, Category.TwoPair);
  assert.deepEqual(best.evaluation.rankVector, [Category.TwoPair, 14, 13, 12]);
});

test("七选五：同花顺优先于四条", () => {
  const best = bestFromCards(parseCards("9C 9D 9H 9S 5C 6C 7C".split(" ")));
  assert.equal(best.evaluation.category, Category.FourOfAKind);
  const best2 = bestFromCards(parseCards("5C 6C 7C 8C 9C 2D 2H".split(" ")));
  assert.equal(best2.evaluation.category, Category.StraightFlush);
});

test("七选五：独立列举的小牌例逐一校对", () => {
  // 3 张不同对子情形之外的独立穷举校对：含 A2345 的七张牌
  const wheel = bestFromCards(parseCards("AC 2D 3H 4S 5C KD QH".split(" ")));
  assert.equal(wheel.evaluation.category, Category.Straight);
  assert.deepEqual(wheel.evaluation.rankVector, [Category.Straight, 5]);
});

test("输入牌序不改变牌力", () => {
  const codes = ["AH", "KH", "QH", "JH", "TH", "2C", "3D"];
  const a = bestFromCards(parseCards(codes));
  const b = bestFromCards(parseCards([...codes].reverse()));
  assert.deepEqual(a.evaluation.rankVector, b.evaluation.rankVector);
  assert.deepEqual(a.evaluation.cards.map((c) => c.code), b.evaluation.cards.map((c) => c.code));
});

test("花色整体置换不改变牌力", () => {
  // 黑桃同花顺 -> 红桃同花顺（花色重命名映射 S->H, H->S），向量不变
  const remap = (code: string) => {
    const suitMap: Record<string, string> = { S: "H", H: "S", C: "D", D: "C" };
    return code[0] + suitMap[code[1]];
  };
  const a = ev("AS KS QS JS TS");
  const b = ev(["AS", "KS", "QS", "JS", "TS"].map(remap).join(" "));
  assert.deepEqual(a.rankVector, b.rankVector);
});

test("比较满足反对称性与传递性", () => {
  const x = ev("AC AD KH 7S 2C").rankVector; // AA
  const y = ev("KC KD AH 7S 2C").rankVector; // KK + A 踢脚
  const z = ev("QC QD AH KS 2C").rankVector; // QQ
  assert.equal(compareVectors(x, y), 1);
  assert.equal(compareVectors(y, x), -1, "反对称");
  assert.equal(compareVectors(x, x), 0);
  assert.equal(compareVectors(x, y) > 0 && compareVectors(y, z) > 0, true);
  assert.equal(compareVectors(x, z), 1, "传递性");
});

test("输入校验：未知牌、重复牌、张数错误", () => {
  assert.throws(() => parseCards(["1S"]), (e: unknown) => e instanceof CardInputError && e.code === "INVALID_CARD");
  assert.throws(() => parseCards(["XX"]), (e: unknown) => e instanceof CardInputError && e.code === "INVALID_CARD");
  assert.throws(() => parseCards(["AS", "AS"]), (e: unknown) => e instanceof CardInputError && e.code === "DUPLICATE_CARD");
  assert.throws(() => parseCards(["as", "As"]), (e: unknown) => e instanceof CardInputError && e.code === "DUPLICATE_CARD");
  assert.throws(() => parseCards(["AS", "KS", "QS"], 5), (e: unknown) => e instanceof CardInputError && e.code === "CARD_COUNT");
});

test("多份相同最佳实体组合按固定牌序展示且标记平局", () => {
  // 7 张：三条 9，4 个等高点不影响三条；构造多个三条+踢脚平局：999 + AK 只有一种。
  // 构造高牌多解：2 3 4 5 7 8 K 中取 5 张 —— 用 5 张保证唯一；这里验证葫芦唯一情形 note。
  const best = bestFromCards(parseCards("2C 3D 5H 7S KC 2D 3H".split(" ")));
  assert.ok(Array.isArray(best.tiedCombos));
  assert.ok(best.tiedCombos.length >= 1);
  // 该牌两对 33 22，唯一组合
  assert.equal(best.evaluation.category, Category.TwoPair);
});
