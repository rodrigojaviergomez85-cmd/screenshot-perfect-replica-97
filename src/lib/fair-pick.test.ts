import { describe, expect, it } from "vitest";
import { nextMemory, pickNormal, type NormalMemory } from "./fair-pick";

type S = { id: string; doneThisRound: boolean };
const roster = (n: number): S[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, doneThisRound: false }));

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Runs full rounds with NEXT only, mirroring the app's commit/memory flow. */
function runRounds(n: number, rounds: number, rand: () => number) {
  let list = roster(n);
  let mem: NormalMemory = { last: null, avoid: null };
  const orders: string[][] = [];
  for (let r = 0; r < rounds; r++) {
    const order: string[] = [];
    for (let k = 0; k < n; k++) {
      const newRound = list.every((s) => s.doneThisRound);
      const lastId = mem.last;
      const p = pickNormal(list, newRound, lastId, newRound ? lastId : mem.avoid, rand)!;
      mem = nextMemory(mem, p.id, newRound);
      list = list.map((s) => ({ ...s, doneThisRound: (newRound ? false : s.doneThisRound) || s.id === p.id }));
      order.push(p.id);
    }
    orders.push(order);
  }
  return orders;
}

describe("normal round picks", () => {
  it("500 rounds of 11: everyone once, previous closer never first or last, interior spread", () => {
    const orders = runRounds(11, 500, seeded(42));
    const positions = new Map<number, number>();
    for (let r = 0; r < orders.length; r++) {
      const o = orders[r]!;
      expect(new Set(o).size).toBe(11);
      if (r === 0) continue;
      const prevLast = orders[r - 1]!.at(-1)!;
      const pos = o.indexOf(prevLast);
      expect(pos).toBeGreaterThan(0);
      expect(pos).toBeLessThan(10);
      expect(o.at(-1)).not.toBe(prevLast);
      positions.set(pos, (positions.get(pos) ?? 0) + 1);
    }
    // all 9 interior positions occur, none dominates (expected ~55 each)
    expect(positions.size).toBe(9);
    for (const c of positions.values()) expect(c).toBeGreaterThan(25);
  });

  it("3 students: closer lands in the middle and never repeats back-to-back", () => {
    const orders = runRounds(3, 200, seeded(7));
    for (let r = 1; r < orders.length; r++) expect(orders[r]![1]).toBe(orders[r - 1]![2]);
  });

  it("2 students: no immediate repeat, never blocks", () => {
    const orders = runRounds(2, 100, seeded(3));
    for (let r = 1; r < orders.length; r++) expect(orders[r]![0]).not.toBe(orders[r - 1]![1]);
  });

  it("1 student can be picked again; 0 students picks nobody", () => {
    const one = [{ id: "a", doneThisRound: true }];
    expect(pickNormal(one, true, "a", "a")?.id).toBe("a");
    expect(pickNormal([], true, null, null)).toBeNull();
  });

  it("single pending student is returned even if it is the closer", () => {
    const list = roster(4).map((s) => ({ ...s, doneThisRound: s.id !== "s2" }));
    expect(pickNormal(list, false, "s1", "s2")?.id).toBe("s2");
  });

  it("closer manually picked or absent no longer constrains the pick", () => {
    const list = roster(5).map((s) => ({ ...s, doneThisRound: s.id === "s0" }));
    for (let i = 0; i < 50; i++) expect(pickNormal(list, false, "s1", "s0", Math.random)?.doneThisRound).toBe(false);
  });

  it("memory carries the closer only into the next round", () => {
    let m: NormalMemory = { last: "x", avoid: null };
    m = nextMemory(m, "a", true);
    expect(m).toEqual({ last: "a", avoid: "x" });
    m = nextMemory(m, "b", false);
    expect(m).toEqual({ last: "b", avoid: "x" });
  });
});
