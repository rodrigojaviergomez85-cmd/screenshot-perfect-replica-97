import { describe, expect, it } from "vitest";
import { afEligibility, carryFrom, EMPTY_MEMORY, nextMemory, pickNormal, type AfState, type NormalMemory } from "./fair-pick";
import { confirmTurn } from "./pending-turn";

type S = { id: string; doneThisRound: boolean; skippedThisRound?: boolean };
const roster = (n: number): S[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, doneThisRound: false }));

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Mirrors the app: NEXT picks, X marks skipped and picks again; new round carries skipped ids. */
function run(n: number, rounds: number, rand: () => number, skipWhen: (r: number, k: number, id: string) => boolean = () => false) {
  let list = roster(n);
  let mem: NormalMemory = EMPTY_MEMORY;
  const orders: string[][] = [];
  const skips: string[][] = [];
  let order: string[] = [];
  let sk: string[] = [];
  let r = 0;
  const step = () => {
    const newRound = list.every((s) => s.doneThisRound);
    if (newRound && order.length) { orders.push(order); skips.push(sk); order = []; sk = []; r++; }
    const carry = newRound ? carryFrom(list) : [];
    const p = pickNormal(list, newRound, newRound ? { ...mem, carry } : mem, rand);
    if (!p) return null;
    mem = nextMemory(mem, p.id, newRound, carry);
    list = list.map((s) => {
      const b = newRound ? { ...s, doneThisRound: false, skippedThisRound: false } : s;
      return s.id === p.id ? { ...b, doneThisRound: true, skippedThisRound: false } : b;
    });
    order.push(p.id);
    return p.id;
  };
  while (r < rounds) {
    let id = step();
    // X: skip current (no credit) and pick another pending, if any.
    while (id && r < rounds && skipWhen(r, order.length - 1, id)) {
      sk.push(id);
      list = list.map((s) => (s.id === id ? { ...s, skippedThisRound: true } : s));
      if (list.every((s) => s.doneThisRound)) break;
      id = step();
    }
  }
  return { orders, skips };
}

const noABA = (orders: string[][]) => {
  const flat = orders.flat();
  for (let i = 2; i < flat.length; i++) expect(flat[i]).not.toBe(flat[i - 2]);
};

describe("normal round recency", () => {
  it("exact boundary A-B-A (Sammi→Enderlin→Sammi) cannot happen", () => {
    // End of round: Enderlin second-last, Sammi last... the old rule could open with Enderlin then Sammi.
    const list = [{ id: "Sammi", doneThisRound: true }, { id: "Enderlin", doneThisRound: true }, { id: "Ana", doneThisRound: true }, { id: "Beto", doneThisRound: true }];
    const mem: NormalMemory = { last: "Sammi", prev: "Enderlin", avoid: null, carry: [] };
    for (let i = 0; i < 200; i++) {
      const first = pickNormal(list, true, mem, Math.random)!;
      expect(["Ana", "Beto"]).toContain(first.id);
      const m2 = nextMemory(mem, first.id, true);
      const l2 = list.map((s) => ({ ...s, doneThisRound: s.id === first.id }));
      expect(pickNormal(l2, false, m2, Math.random)!.id).not.toBe("Sammi");
    }
  });

  for (const n of [11, 20]) {
    it(`${n} students over 300 rounds: everyone once, no A-B-A, closer never last`, () => {
      const { orders } = run(n, 300, seeded(n));
      for (let r = 0; r < orders.length; r++) {
        expect(new Set(orders[r]).size).toBe(n);
        if (r === 0) continue;
        const prev = orders[r - 1]!;
        expect(orders[r]!.slice(0, 2)).not.toContain(prev.at(-1));
        expect(orders[r]![0]).not.toBe(prev.at(-2));
        expect(orders[r]!.at(-1)).not.toBe(prev.at(-1));
      }
      noABA(orders);
    });
  }

  it("3 students: recency wins, no A-B-A, everyone once", () => {
    const { orders } = run(3, 100, seeded(7));
    orders.forEach((o) => expect(new Set(o).size).toBe(3));
    noABA(orders);
  });

  it("2 students: no immediate repeat, never blocks", () => {
    const { orders } = run(2, 100, seeded(3));
    for (let r = 1; r < orders.length; r++) expect(orders[r]![0]).not.toBe(orders[r - 1]![1]);
  });

  it("1 student can be picked again; 0 students picks nobody", () => {
    expect(pickNormal([{ id: "a", doneThisRound: true }], true, { ...EMPTY_MEMORY, last: "a" })?.id).toBe("a");
    expect(pickNormal([], true, EMPTY_MEMORY)).toBeNull();
  });

  it("single pending student is returned even if recent", () => {
    const list = roster(4).map((s) => ({ ...s, doneThisRound: s.id !== "s2" }));
    expect(pickNormal(list, false, { last: "s1", prev: "s2", avoid: "s2", carry: [] })?.id).toBe("s2");
  });

  it("absent/deleted students are never picked (only the present list is a candidate)", () => {
    const present = roster(5).filter((s) => s.id !== "s3");
    for (let i = 0; i < 100; i++) expect(pickNormal(present, true, { ...EMPTY_MEMORY, carry: ["s3"] })?.id).not.toBe("s3");
  });
});

describe("skipped students recover early", () => {
  it("skip the last student of a round: back within the first 3 picks", () => {
    for (const n of [3, 5, 11, 20]) {
      const { orders, skips } = run(n, 60, seeded(n + 1), (r, k) => r % 2 === 0 && k === n - 1);
      for (let r = 1; r < orders.length; r += 2) {
        const s = skips[r - 1]![0]!;
        expect(orders[r]!.indexOf(s)).toBeLessThan(3);
      }
    }
  });

  it("one skipped mid-round with >=3 present returns within first 3 picks", () => {
    const { orders, skips } = run(11, 80, seeded(9), (r, k) => r % 2 === 0 && k === 4);
    for (let r = 1; r < orders.length; r += 2) expect(orders[r]!.indexOf(skips[r - 1]![0]!)).toBeLessThan(3);
  });

  it("multiple skipped are served before the others (after the cooldown), nobody starves", () => {
    const { orders, skips } = run(11, 80, seeded(11), (r, k) => r % 2 === 0 && (k === 2 || k === 6 || k === 9));
    for (let r = 1; r < orders.length; r += 2) {
      expect(new Set(orders[r]).size).toBe(11);
      const prev = orders[r - 1]!;
      const set = skips[r - 1]!.filter((x) => !prev.slice(-2).includes(x));
      for (const s of set) expect(orders[r]!.indexOf(s)).toBeLessThan(skips[r - 1]!.length + 2);
    }
  });

  it("skip everyone: rounds keep working, everyone once", () => {
    const { orders } = run(5, 20, seeded(5), () => true);
    orders.forEach((o) => expect(new Set(o).size).toBe(5));
  });

  it("repeated X defers to the following round, never later in the same round", () => {
    const { orders } = run(6, 30, seeded(2), (_r, _k, id) => id === "s0");
    orders.forEach((o) => expect(o.filter((x) => x === "s0").length).toBe(1));
  });

  it("X never changes totals; NEXT confirms exactly once", () => {
    const st = [{ id: "a", total: 2, roundsCompleted: 2 }, { id: "b", total: 2, roundsCompleted: 2 }];
    // X discards the pending turn: nothing is confirmed.
    expect(confirmTurn(st, null, "normal", "d", "w")).toEqual(st);
    const once = confirmTurn(st, { id: "a", day: "d", earnsRound: true }, "normal", "d", "w");
    expect(once.map((s) => s.total)).toEqual([3, 2]);
  });

  it("memory: carry only into the next round, and served ids leave the carry", () => {
    let m: NormalMemory = { last: "x", prev: "y", avoid: null, carry: [] };
    m = nextMemory(m, "a", true, ["k", "a"]);
    expect(m).toEqual({ last: "a", prev: "x", avoid: "x", carry: ["k"] });
    m = nextMemory(m, "k", false);
    expect(m).toEqual({ last: "k", prev: "a", avoid: "x", carry: [] });
  });
});

describe("Automatic Fluency recency and carry", () => {
  const W = "2026-10-12";
  const st = (p: Partial<AfState>): AfState => ({ week: W, queue: [], last: null, prev: null, skipped: [], carry: [], ...p });
  const done = (ids: string[]) => ids.map((id) => ({ id, afWeek: W }));

  it("weekly fresh beats recency and carry", () => {
    const present = [...done(["a", "b", "c"]), { id: "f" }];
    const r = afEligibility(present, "a", st({ queue: ["a", "b", "c"], carry: ["b"], prev: "f" }));
    expect(r.phase).toBe("fresh");
    expect(r.auto).toEqual(["f"]);
  });

  it("new cycle: neither last nor penultimate opens; manual eligibility stays broad", () => {
    const present = done(["a", "b", "c", "d"]);
    const r = afEligibility(present, "d", st({ queue: ["a", "b", "c", "d"], last: "d", prev: "c" }));
    expect(r.reset).toBe(true);
    expect(r.auto.sort()).toEqual(["a", "b"]);
    expect(r.ids).toContain("c");
  });

  it("second position of a cycle avoids last→other→last", () => {
    const present = done(["a", "b", "c", "d"]);
    const r = afEligibility(present, "a", st({ queue: ["a"], last: "a", prev: "d" }));
    expect(r.auto.sort()).toEqual(["b", "c"]);
  });

  it("skipped in the previous cycle are served first in the next", () => {
    const present = done(["a", "b", "c", "d", "e"]);
    const r = afEligibility(present, "e", st({ queue: ["a", "b", "d", "e"], last: "e", prev: "d", skipped: ["c"] }));
    // c is unvisited in this cycle so it is simply eligible; once the cycle resets, carry applies.
    expect(r.ids).toEqual(["c"]);
    const r2 = afEligibility(present, "c", st({ queue: ["a", "b", "c", "d", "e"], last: "c", prev: "e", skipped: ["b"] }));
    expect(r2.reset).toBe(true);
    expect(r2.auto).toEqual(["b"]);
    const r3 = afEligibility(present, "a", st({ queue: ["a"], last: "a", prev: "c", carry: ["d"] }));
    expect(r3.auto).toEqual(["d"]);
  });

  it("1 and 2 present students never block", () => {
    expect(afEligibility(done(["a"]), "a", st({ queue: ["a"], last: "a" })).auto).toEqual(["a"]);
    expect(afEligibility(done(["a", "b"]), "b", st({ queue: ["a", "b"], last: "b", prev: "a" })).auto).toEqual(["a"]);
    expect(afEligibility([], null, st({})).auto).toEqual([]);
  });
});
