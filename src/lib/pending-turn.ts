/**
 * Pending-turn model: picking a student never credits them. NEXT (or a manual pick / End class)
 * confirms the outgoing pending turn exactly once; Skip discards it without adding or removing anything.
 */
export type PendingTurn = {
  id: string;
  /** Local day the turn was picked; a pending turn from another day is discarded, never credited. */
  day: string;
  /** Normal mode: whether confirming also earns this student's round. */
  earnsRound?: boolean;
  /** AF mode: week key the turn belongs to. */
  week?: string;
};

export type Pendings = { normal: PendingTurn | null; af: PendingTurn | null };
export const NO_PENDING: Pendings = { normal: null, af: null };

export type CreditStudent = { id: string; total: number; roundsCompleted: number; afWeek?: string | undefined };

/** Applies the credit of one pending turn. Stale (other day / other week) turns are ignored. */
export function confirmTurn<T extends CreditStudent>(
  list: T[],
  pending: PendingTurn | null,
  mode: "normal" | "af",
  today: string,
  week: string,
): T[] {
  if (!pending || pending.day !== today) return list;
  if (mode === "af" && pending.week !== week) return list;
  return list.map((s) =>
    s.id !== pending.id
      ? s
      : mode === "af"
        ? { ...s, total: s.total + 1, afWeek: week }
        : { ...s, total: s.total + 1, roundsCompleted: s.roundsCompleted + (pending.earnsRound ? 1 : 0) },
  );
}

/** Restores saved pendings only when they belong to today (and this week for AF) and the student still exists. */
export function restorePendings(raw: unknown, ids: Set<string>, today: string, week: string): Pendings {
  const one = (p: unknown, af: boolean): PendingTurn | null => {
    if (!p || typeof p !== "object") return null;
    const t = p as Partial<PendingTurn>;
    if (typeof t.id !== "string" || !ids.has(t.id) || t.day !== today) return null;
    if (af && t.week !== week) return null;
    return { id: t.id, day: t.day, ...(af ? { week: week } : { earnsRound: !!t.earnsRound }) };
  };
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<"normal" | "af", unknown>>;
  return { normal: one(r.normal, false), af: one(r.af, true) };
}
