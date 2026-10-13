/**
 * Automatic pick rules (pure, random source injectable for tests). Manual picks never go through
 * the recency/priority preferences here; they only use base eligibility.
 *
 * Normal rounds:
 * - Within a round only pending (present, not done) students are eligible.
 * - Recency: the last TWO distinct students shown are avoided whenever another eligible student exists
 *   (falls back to avoiding only the last one, then to anyone). This stops A-B-A across a round boundary.
 * - Carry priority: students skipped (X) in the previous round are served first in the next round,
 *   once the recency cooldown allows, so they are never stranded last.
 * - `avoid` is the previous round's closer: kept off the last position (interior spread) when compatible.
 *   Recency wins over that positional rule when both cannot hold (e.g. 3 students).
 */
export type PickCandidate = { id: string; doneThisRound: boolean };

export type NormalMemory = { last: string | null; prev: string | null; avoid: string | null; carry: string[] };
export const EMPTY_MEMORY: NormalMemory = { last: null, prev: null, avoid: null, carry: [] };

/** Recency cooldown, then carry priority, over an already-eligible pool. Never empties a non-empty pool. */
export function preferAuto<T extends { id: string }>(
  pool: T[],
  recent: (string | null)[],
  carry: string[],
): { pool: T[]; carried: boolean } {
  let p = pool;
  const r = recent.filter((x): x is string => !!x);
  const noRecent = p.filter((s) => !r.includes(s.id));
  if (noRecent.length > 0) p = noRecent;
  else if (r[0]) {
    const noLast = p.filter((s) => s.id !== r[0]);
    if (noLast.length > 0) p = noLast;
  }
  const pri = p.filter((s) => carry.includes(s.id));
  return pri.length > 0 ? { pool: pri, carried: true } : { pool: p, carried: false };
}

/** Ids of present students skipped (X) this round: they get priority in the next round. */
export function carryFrom(present: { id: string; skippedThisRound?: boolean }[]): string[] {
  return present.filter((s) => s.skippedThisRound).map((s) => s.id);
}

export function pickNormal<T extends PickCandidate>(
  present: T[],
  newRound: boolean,
  mem: NormalMemory,
  rand: () => number = Math.random,
): T | null {
  const base = newRound ? present : present.filter((s) => !s.doneThisRound);
  if (base.length === 0) return null;
  const { pool, carried } = preferAuto(base, [mem.last, mem.prev], mem.carry);
  const avoidId = newRound ? mem.last : mem.avoid;
  const avoid = !carried && avoidId && present.length >= 3 ? pool.find((s) => s.id === avoidId) : undefined;
  if (avoid && pool.length >= 2) {
    const others = pool.filter((s) => s !== avoid);
    if (rand() * (pool.length - 1) < 1) return avoid;
    return others[Math.floor(rand() * others.length)] ?? others[0] ?? null;
  }
  return pool[Math.floor(rand() * pool.length)] ?? pool[0] ?? null;
}

/** Memory after a pick. On a new round, `newCarry` (last round's skipped) becomes the priority set. */
export function nextMemory(mem: NormalMemory, pickedId: string, startsNewRound: boolean, newCarry: string[] = []): NormalMemory {
  return {
    last: pickedId,
    prev: mem.last && mem.last !== pickedId ? mem.last : mem.prev,
    avoid: startsNewRound ? mem.last : mem.avoid,
    carry: (startsNewRound ? newCarry : mem.carry).filter((x) => x !== pickedId),
  };
}

/** Automatic Fluency cycle state (per class, per week). */
export type AfState = {
  week: string;
  /** Ids already visited in the current cycle. */
  queue: string[];
  last: string | null;
  prev: string | null;
  /** Skipped in the current cycle (sit out until it ends). */
  skipped: string[];
  /** Skipped in the previous cycle: served first in this one. */
  carry: string[];
};
export type AfCandidate = { id: string; afWeek?: string | undefined };

/**
 * AF eligibility. `ids` is base eligibility (used by manual picks); `auto` adds recency and carry
 * preferences inside it (used by NEXT/X). Weekly-fresh priority is decided first, so it always
 * outranks recency and carry.
 */
export function afEligibility(present: AfCandidate[], curIdIn: string | null, st: AfState): {
  phase: "fresh" | "cycle"; ids: string[]; auto: string[]; reset: boolean;
} {
  const curId = curIdIn ?? st.last;
  const finish = (phase: "fresh" | "cycle", pool: AfCandidate[], reset: boolean) => {
    const carry = reset ? st.skipped : st.carry;
    const auto = preferAuto(pool, [curId, st.prev], carry).pool;
    return { phase, ids: pool.map((s) => s.id), auto: auto.map((s) => s.id), reset };
  };
  const fresh = present.filter((s) => s.afWeek !== st.week && s.id !== curIdIn && !st.skipped.includes(s.id));
  if (fresh.length > 0) return finish("fresh", fresh, false);
  let reset = false;
  let pool = present.filter((s) => !st.queue.includes(s.id));
  if (pool.length === 0) {
    // New cycle: skips expire, so anyone still without AF this week keeps priority.
    const freshAll = present.filter((s) => s.afWeek !== st.week && (s.id !== curIdIn || st.skipped.includes(s.id)));
    if (freshAll.length > 0) return finish("fresh", freshAll, true);
    pool = present; reset = true;
  }
  const withoutCurrent = pool.filter((s) => s.id !== curId);
  if (withoutCurrent.length > 0) pool = withoutCurrent;
  else if (!reset) {
    // Only the current student is left in this cycle: start a new cycle, still avoiding the current one.
    const alt = present.filter((s) => s.id !== curId);
    if (alt.length > 0) { pool = alt; reset = true; }
  }
  return finish("cycle", pool, reset);
}
