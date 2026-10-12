import { describe, expect, it } from "vitest";
import { acquireClassesLock, type LockStatus } from "./tab-lock";

describe("classes ownership", () => {
  it("without Web Locks reports unsupported (never owner)", () => {
    const seen: LockStatus[] = [];
    acquireClassesLock((s) => seen.push(s), undefined);
    expect(seen).toEqual(["unsupported"]);
  });
  it("a failing lock request reports unsupported, not owner", async () => {
    const seen: LockStatus[] = [];
    const locks = { request: () => Promise.reject(new Error("SecurityError")) } as unknown as LockManager;
    acquireClassesLock((s) => seen.push(s), locks);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["unsupported"]);
  });
});
