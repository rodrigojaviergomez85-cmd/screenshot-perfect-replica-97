import { describe, expect, it } from "vitest";
import { leaseFree, LEASE_TTL_MS, parseLease } from "./tab-lock";

describe("classes lease fallback", () => {
  it("another tab's fresh lease blocks; a stale one (closed/crashed tab) frees", () => {
    const now = 100_000;
    expect(leaseFree({ owner: "a", ts: now - 1000 }, "b", now)).toBe(false);
    expect(leaseFree({ owner: "a", ts: now - LEASE_TTL_MS - 1 }, "b", now)).toBe(true);
    expect(leaseFree({ owner: "b", ts: now }, "b", now)).toBe(true);
    expect(leaseFree(parseLease("garbage"), "b", now)).toBe(true);
  });
});
