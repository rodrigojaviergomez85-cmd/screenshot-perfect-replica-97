import { describe, expect, it } from "vitest";
import { confirmTurn, restorePendings } from "./pending-turn";

const base = () => [
  { id: "ana", total: 5, roundsCompleted: 5, afWeek: "2026-09-28" as string | undefined },
  { id: "beto", total: 5, roundsCompleted: 5, afWeek: undefined as string | undefined },
  { id: "carla", total: 5, roundsCompleted: 5, afWeek: undefined as string | undefined },
];
const DAY = "2026-10-05";
const WEEK = "2026-10-05";

describe("pending turn credit", () => {
  it("NEXT confirms the outgoing normal turn exactly +1 and earns the round once", () => {
    const out = confirmTurn(base(), { id: "beto", day: DAY, earnsRound: true }, "normal", DAY, WEEK);
    expect(out.map((s) => s.total)).toEqual([5, 6, 5]);
    expect(out[1]!.roundsCompleted).toBe(6);
  });

  it("an extra manual turn in the same round adds a tally but no round", () => {
    const out = confirmTurn(base(), { id: "ana", day: DAY, earnsRound: false }, "normal", DAY, WEEK);
    expect(out[0]!.total).toBe(6);
    expect(out[0]!.roundsCompleted).toBe(5);
  });

  it("no pending (picked then skipped) leaves every total untouched", () => {
    expect(confirmTurn(base(), null, "normal", DAY, WEEK).map((s) => s.total)).toEqual([5, 5, 5]);
  });

  it("AF confirm sets afWeek and +1; previous afWeek of others is kept", () => {
    const out = confirmTurn(base(), { id: "beto", day: DAY, week: WEEK }, "af", DAY, WEEK);
    expect(out[1]).toMatchObject({ total: 6, afWeek: WEEK });
    expect(out[0]!.afWeek).toBe("2026-09-28");
  });

  it("a pending turn from another day is never credited", () => {
    expect(confirmTurn(base(), { id: "ana", day: "2026-10-04", earnsRound: true }, "normal", DAY, WEEK)[0]!.total).toBe(5);
  });

  it("restore drops stale or removed pendings and never invents one", () => {
    const ids = new Set(["ana", "beto"]);
    expect(restorePendings(undefined, ids, DAY, WEEK)).toEqual({ normal: null, af: null });
    expect(restorePendings({ normal: { id: "zed", day: DAY } }, ids, DAY, WEEK).normal).toBeNull();
    expect(restorePendings({ normal: { id: "ana", day: "2026-10-04" } }, ids, DAY, WEEK).normal).toBeNull();
    expect(restorePendings({ af: { id: "ana", day: DAY, week: "2026-09-28" } }, ids, DAY, WEEK).af).toBeNull();
    expect(restorePendings({ normal: { id: "ana", day: DAY, earnsRound: true } }, ids, DAY, WEEK).normal)
      .toEqual({ id: "ana", day: DAY, earnsRound: true });
  });
});
