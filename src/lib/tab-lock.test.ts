import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireClassesLock, type LockStatus } from "./tab-lock";

describe("classes ownership", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("without Web Locks reports unsupported (never owner)", () => {
    vi.stubGlobal("navigator", {});
    const seen: LockStatus[] = [];
    const handle = acquireClassesLock((s) => seen.push(s), undefined);
    try {
      expect(seen).toEqual(["unsupported"]);
    } finally {
      handle.release();
      vi.unstubAllGlobals();
    }
  });
  it("a failing lock request reports unsupported, not owner", async () => {
    const seen: LockStatus[] = [];
    const locks = { request: () => Promise.reject(new Error("SecurityError")) } as unknown as LockManager;
    acquireClassesLock((s) => seen.push(s), locks);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["unsupported"]);
  });
});
