/**
 * Exclusive editing ownership of the saved classes, per origin (one tab at a time).
 * Primary: Web Locks (released by the browser when the owning tab closes or crashes).
 * Fallback: a localStorage lease renewed by heartbeat, considered free once it goes stale.
 * The Document PiP window runs in the same JS session as its opener, so it never competes.
 */
export const CLASSES_LOCK_NAME = "fair-turns-classes-owner";
export const LEASE_KEY = "fair-turns-classes-lease";
export const LEASE_TTL_MS = 6000;
export const LEASE_BEAT_MS = 2000;

export type Lease = { owner: string; ts: number };

export function parseLease(raw: string | null): Lease | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Lease>;
    return typeof v.owner === "string" && typeof v.ts === "number" ? { owner: v.owner, ts: v.ts } : null;
  } catch {
    return null;
  }
}

/** A lease is free when missing, stale, or already ours. */
export function leaseFree(lease: Lease | null, me: string, now: number): boolean {
  return !lease || lease.owner === me || now - lease.ts > LEASE_TTL_MS;
}

export type LockStatus = "acquiring" | "owner" | "blocked";

type Handle = { release: () => void };

/**
 * Requests ownership. `onStatus` reports "owner" when granted and "blocked" while another tab holds it;
 * a blocked request keeps waiting and is granted automatically once the other tab lets go.
 */
export function acquireClassesLock(onStatus: (s: LockStatus) => void, storage: Storage | null): Handle {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks && typeof locks.request === "function") {
    let done = false;
    let releaseHeld: () => void = () => {};
    const abort = new AbortController();
    const blockedTimer = setTimeout(() => { if (!done) onStatus("blocked"); }, 400);
    locks
      .request(CLASSES_LOCK_NAME, { signal: abort.signal }, () => {
        if (done) return undefined;
        clearTimeout(blockedTimer);
        onStatus("owner");
        return new Promise<void>((resolve) => { releaseHeld = resolve; });
      })
      .catch(() => { /* aborted */ });
    return {
      release: () => {
        done = true;
        clearTimeout(blockedTimer);
        abort.abort();
        releaseHeld();
      },
    };
  }
  if (!storage) {
    // No storage means nothing is persisted, so nothing can be overwritten.
    onStatus("owner");
    return { release: () => {} };
  }
  const me = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let owner = false;
  let stopped = false;
  const read = () => { try { return parseLease(storage.getItem(LEASE_KEY)); } catch { return null; } };
  const write = () => { try { storage.setItem(LEASE_KEY, JSON.stringify({ owner: me, ts: Date.now() })); } catch { /* ignore */ } };
  const tick = () => {
    if (stopped) return;
    const lease = read();
    if (owner) {
      if (lease && lease.owner !== me && Date.now() - lease.ts <= LEASE_TTL_MS) { owner = false; onStatus("blocked"); return; }
      write();
      return;
    }
    if (!leaseFree(lease, me, Date.now())) { onStatus("blocked"); return; }
    write();
    // Confirm after a short delay: if another tab raced us, the last writer wins and the other backs off.
    setTimeout(() => {
      if (stopped) return;
      const again = read();
      if (again?.owner === me) { owner = true; onStatus("owner"); } else onStatus("blocked");
    }, 120);
  };
  const onUnload = () => { if (owner && read()?.owner === me) { try { storage.removeItem(LEASE_KEY); } catch { /* ignore */ } } };
  tick();
  const beat = setInterval(tick, LEASE_BEAT_MS);
  window.addEventListener("pagehide", onUnload);
  return {
    release: () => {
      stopped = true;
      clearInterval(beat);
      window.removeEventListener("pagehide", onUnload);
      onUnload();
    },
  };
}
