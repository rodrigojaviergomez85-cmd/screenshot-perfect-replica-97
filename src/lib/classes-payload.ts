/**
 * Top-level validation of the saved classes blob. Only "absent" (never saved) and "ok" may enable saves;
 * a failed read or malformed payload must never be replaced by an empty list.
 */
export type ClassesRead<C> =
  | { kind: "absent" }
  | { kind: "ok"; classes: C[]; lastId: string | null }
  | { kind: "invalid" };

export function parseClassesPayload<C>(raw: string | null, normalize: (c: unknown) => C | null): ClassesRead<C> {
  if (raw === null) return { kind: "absent" };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { kind: "invalid" }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { kind: "invalid" };
  const d = data as { lastId?: unknown; classes?: unknown };
  if (!Array.isArray(d.classes)) return { kind: "invalid" };
  const classes = d.classes.map(normalize);
  // A single unreadable class would be dropped on the next save: refuse rather than lose it.
  if (classes.some((c) => c === null)) return { kind: "invalid" };
  return { kind: "ok", classes: classes as C[], lastId: typeof d.lastId === "string" ? d.lastId : null };
}

/** A stored roster must be an array whose every entry is a well-formed student (empty is fine). */
export function isValidRoster(raw: unknown): raw is unknown[] {
  return Array.isArray(raw) && raw.every((s) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) return false;
    const st = s as Record<string, unknown>;
    if (typeof st["id"] !== "string" || typeof st["name"] !== "string") return false;
    for (const k of ["total", "roundsCompleted"]) if (st[k] !== undefined && !Number.isFinite(Number(st[k]))) return false;
    return true;
  });
}
