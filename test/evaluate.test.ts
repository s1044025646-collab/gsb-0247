import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCards, cardToString } from "../dist/cards.js";
import { evaluate5, bestOf, compareEval } from "../dist/evaluate.js";

const ev = (s: string) => evaluate5(parseCards(s.split(" ")));
const best = (s: string) => bestOf(parseCards(s.split(" ")));

test("九种牌型分类", () => {
  assert.equal(ev("As Ks Qs Js Ts").category, 8); // 同花顺
  assert.equal(ev("9c 9d 9h 9s 2c").category, 7); // 四条
  assert.equal(ev("9c 9d 9h 2s 2c").category, 6); // 葫芦
  assert.equal(ev("Ah 9h 7h 4h 2h").category, 5); // 同花
  assert.equal(ev("9c 8d 7h 6s 5c").category, 4); // 顺子
  assert.equal(ev("9c 9d 9h 5s 2c").category, 3); // 三条
  assert.equal(ev("9c 9d 5h 5s 2c").category, 2); // 两对
  assert.equal(ev("9c 9d 5h 3s 2c").category, 1); // 一对
  assert.equal(ev("Ac 9d 5h 3s 2c").category, 0); // 高牌
});

test("A2345 是五高顺子，QKA23 不成立", () => {
  const wheel = ev("As 2d 3h 4c 5s");
  assert.equal(wheel.category, 4);
  assert.deepEqual(wheel.vector, [5]);
  assert.equal(ev("As 2d 3h 4c 5s").category, 4);
  assert.equal(ev("Qs Kd Ah 2c 3s").category, 0); // QKA23 非顺子
  // 轮子小于 6 高顺子
  assert.ok(compareEval(ev("As 2d 3h 4c 5s"), ev("2s 3d 4h 5c 6s")) < 0);
});

test("非连续同花是同花不是顺子", () => {
  const r = ev("Ah Qh 9h 5h 2h");
  assert.equal(r.category, 5);
  assert.deepEqual(r.vector, [14, 12, 9, 5, 2]);
});

test("七张中两组三条选更大三条为葫芦主体", () => {
  const r = best("9s 9d 9h 5c 5d 5h 2c");
  assert.equal(r.category, 6);
  assert.deepEqual(r.vector, [9, 9, 9, 5, 5]);
});

test("七张中三组对子选最大的两对", () => {
  const r = best("As Ad Kh Kc 2s 2d 5c");
  assert.equal(r.category, 2);
  assert.deepEqual(r.vector, [14, 14, 13, 13, 5]);
});

test("四条带正确踢脚", () => {
  const r = best("9s 9d 9h 9c As Kd 2c");
  assert.equal(r.category, 7);
  assert.deepEqual(r.vector, [9, 9, 9, 9, 14]);
});

test("踢脚决定同对子胜负", () => {
  const a = ev("9s Ah 5c 2d 9d");
  const b = ev("9h Kh 5d 2c 9c");
  assert.ok(compareEval(a, b) > 0);
});

test("花色不打破平局", () => {
  const a = ev("As Ks Qs Js 9s");
  const b = ev("Ah Kh Qh Jh 9h");
  assert.equal(compareEval(a, b), 0);
});

test("枚举小牌例校对七选五", () => {
  // 对若干 7 张牌，暴力比较所有 21 个子集与 bestOf 结果一致
  const cases = [
    "As Kd Qh Jc 9s 8d 2c",
    "As Ah Kd Kc Qs 2d 3c",
    "5s 6s 7s 8s 9s Ah 2d",
    "2s 2d 2h 3c 3d 3h 4s",
  ];
  for (const c of cases) {
    const cards = parseCards(c.split(" "));
    const b = bestOf(cards);
    let combos = 0;
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++) {
        combos++;
        const sub = cards.filter((_, k) => k !== i && k !== j);
        assert.ok(compareEval(b, evaluate5(sub)) >= 0, `${c} 子集 ${sub.map(cardToString)}`);
      }
    assert.equal(combos, 21);
  }
});

test("输入牌序与花色整体置换不改变牌力", () => {
  const base = "As Ah Kd Kc Qs 9d 2c";
  const b1 = best(base);
  const shuffled = best("2c Qs Kc As 9d Ah Kd");
  assert.equal(compareEval(b1, shuffled), 0);
  // 花色置换 s<->h
  const swapped = best(base.replaceAll("s", "x").replaceAll("h", "s").replaceAll("x", "h"));
  assert.equal(compareEval(b1, swapped), 0);
});

test("比较满足反对称性与传递性", () => {
  const hands = [
    "As Ks Qs Js Ts", "9c 9d 9h 9s Ac", "9c 9d 9h Ac Ad",
    "Ah 9h 7h 4h 2h", "9c 8d 7h 6s 5c", "9c 9d 9h 5s 2c",
    "9c 9d 5h 5s Ac", "9c 9d 5h 3s 2c", "Ac 9d 5h 3s 2c",
  ].map(ev);
  for (const a of hands)
    for (const b of hands) {
      const ab = Math.sign(compareEval(a, b));
      const ba = Math.sign(compareEval(b, a));
      assert.ok(ab === -ba, "反对称性");
    }
  for (const a of hands)
    for (const b of hands)
      for (const c of hands) {
        if (compareEval(a, b) > 0 && compareEval(b, c) > 0) {
          assert.ok(compareEval(a, c) > 0, "传递性");
        }
      }
});

