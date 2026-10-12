/**
 * Exclusive editing ownership of the saved classes, per origin, via Web Locks only.
 * The browser releases the lock when the owning tab closes or crashes. localStorage has no atomic
 * compare-and-swap, so without Web Locks the app reports "unsupported" and never enables class writes.
 * The Document PiP window runs in its opener's JS session, so it shares the opener's ownership.
 */
export const CLASSES_LOCK_NAME = "fair-turns-classes-owner";

export type LockStatus = "acquiring" | "owner" | "blocked" | "unsupported";

type Handle = { release: () => void };

/**
 * Requests ownership. Reports "blocked" while another tab holds it; the request keeps waiting and
 * reports "owner" once the other tab lets go.
 */
export function acquireClassesLock(
  onStatus: (s: LockStatus) => void,
  locks: LockManager | undefined = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined,
): Handle {
  if (!locks || typeof locks.request !== "function") {
    onStatus("unsupported");
    return { release: () => {} };
  }
  let done = false;
  let releaseHeld: () => void = () => {};
  const abort = new AbortController();
  const blockedTimer = setTimeout(() => { if (!done) onStatus("blocked"); }, 400);
  try {
    locks
      .request(CLASSES_LOCK_NAME, { signal: abort.signal }, () => {
        if (done) return undefined;
        clearTimeout(blockedTimer);
        onStatus("owner");
        return new Promise<void>((resolve) => { releaseHeld = resolve; });
      })
      .catch(() => {
        clearTimeout(blockedTimer);
        if (!done) onStatus("unsupported");
      });
  } catch {
    clearTimeout(blockedTimer);
    onStatus("unsupported");
  }
  return {
    release: () => {
      done = true;
      clearTimeout(blockedTimer);
      abort.abort();
      releaseHeld();
    },
  };
}
