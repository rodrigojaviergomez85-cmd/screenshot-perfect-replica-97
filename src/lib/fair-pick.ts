/**
 * Normal-round pick rule (pure, random source injectable for tests).
 *
 * - Within a round only pending (present, not done) students are eligible.
 * - First pick of a new round avoids `lastId` (the student shown last) when someone else is present.
 * - `avoidId` is the student who closed the previous round. With 3+ present students it is never
 *   left as the last pending student of the current round: while k students are pending (k >= 2),
 *   it is picked with probability 1/(k-1), which spreads it uniformly over the interior positions.
 */
export type PickCandidate = { id: string; doneThisRound: boolean };

export function pickNormal<T extends PickCandidate>(
  present: T[],
  newRound: boolean,
  lastId: string | null,
  avoidId: string | null,
  rand: () => number = Math.random,
): T | null {
  let pool = newRound ? present : present.filter((s) => !s.doneThisRound);
  if (newRound && present.length >= 2 && lastId) {
    const filtered = pool.filter((s) => s.id !== lastId);
    if (filtered.length > 0) pool = filtered;
  }
  if (pool.length === 0) return null;
  const avoid = avoidId && present.length >= 3 ? pool.find((s) => s.id === avoidId) : undefined;
  if (avoid && pool.length >= 2) {
    const others = pool.filter((s) => s !== avoid);
    if (rand() * (pool.length - 1) < 1) return avoid;
    return others[Math.floor(rand() * others.length)] ?? others[0] ?? null;
  }
  return pool[Math.floor(rand() * pool.length)] ?? pool[0] ?? null;
}

/** Memory for the next pick: the closing student of a round becomes the one to keep off both ends. */
export type NormalMemory = { last: string | null; avoid: string | null };

export function nextMemory(mem: NormalMemory, pickedId: string, startsNewRound: boolean): NormalMemory {
  return { last: pickedId, avoid: startsNewRound ? mem.last : mem.avoid };
}
