/**
 * Classroom energy boosters: pure timing/cue logic plus an independent monotonic clock.
 * Never touches class state (turns, tallies, rounds, AF); the panel only pauses the class timer.
 */
export type BoosterId = "freeze" | "beat" | "opposite";

export const BOOSTERS = [
  { id: "freeze", title: "Move & Freeze", es: "Muévete y congélate", emoji: "🕺", seconds: 30 },
  { id: "beat", title: "Copy My Beat", es: "Escucha y repite el ritmo", emoji: "🥁", seconds: 20 },
  { id: "opposite", title: "Opposite Challenge", es: "Haz lo contrario", emoji: "🔄", seconds: 30 },
] as const satisfies readonly { id: BoosterId; title: string; es: string; emoji: string; seconds: number }[];

export const boosterSeconds = (id: BoosterId) => BOOSTERS.find((b) => b.id === id)!.seconds;

/** Pause-aware monotonic clock. `now` is injectable for tests. */
export class BoosterClock {
  private startedAt: number | null = null;
  private banked = 0;
  constructor(private readonly now: () => number = () => performance.now()) {}
  get running() { return this.startedAt !== null; }
  start() { this.banked = 0; this.startedAt = this.now(); }
  pause() { if (this.startedAt === null) return; this.banked += this.now() - this.startedAt; this.startedAt = null; }
  resume() { if (this.startedAt === null) this.startedAt = this.now(); }
  stop() { this.startedAt = null; this.banked = 0; }
  elapsedMs() { return this.banked + (this.startedAt === null ? 0 : this.now() - this.startedAt); }
}

export type Slot = "clap" | "rest";
export const BEAT_PATTERNS: Slot[][] = [
  ["clap", "clap", "rest", "clap"],
  ["clap", "rest", "clap", "clap"],
  ["clap", "clap", "clap", "clap"],
];
const SLOT_MS = 800;
const PHASE_MS = SLOT_MS * BEAT_PATTERNS[0]!.length; // listen 3.2s, copy 3.2s
export const OPPOSITE: Record<string, { es: string; opposite: string; oppositeEs: string }> = {
  UP: { es: "arriba", opposite: "DOWN", oppositeEs: "abajo" },
  DOWN: { es: "abajo", opposite: "UP", oppositeEs: "arriba" },
  LEFT: { es: "izquierda", opposite: "RIGHT", oppositeEs: "derecha" },
  RIGHT: { es: "derecha", opposite: "LEFT", oppositeEs: "izquierda" },
};
const OPPOSITE_SEQ = ["UP", "LEFT", "DOWN", "RIGHT", "LEFT", "UP", "RIGHT", "DOWN", "UP", "LEFT"];

export type Cue =
  | { kind: "done" }
  | { kind: "move" | "freeze"; step: number; beat: number }
  | { kind: "listen" | "copy"; step: number; pattern: number; slot: number; clap: boolean }
  | { kind: "say"; step: number; word: string };

/** Cue at a given elapsed time. `step` changes exactly when a new audible cue is due. */
export function boosterCue(id: BoosterId, elapsedMs: number): Cue {
  const e = Math.max(0, elapsedMs);
  if (e >= boosterSeconds(id) * 1000) return { kind: "done" };
  if (id === "freeze") {
    const cycle = Math.floor(e / 8000);
    const inCycle = e % 8000;
    return inCycle < 5000
      ? { kind: "move", step: cycle * 2, beat: Math.floor(inCycle / 500) }
      : { kind: "freeze", step: cycle * 2 + 1, beat: 0 };
  }
  if (id === "beat") {
    const phase = Math.floor(e / PHASE_MS);
    const pattern = Math.floor(phase / 2);
    if (pattern >= BEAT_PATTERNS.length) return { kind: "done" };
    const slot = Math.floor((e % PHASE_MS) / SLOT_MS);
    return { kind: phase % 2 === 0 ? "listen" : "copy", step: phase * 4 + slot, pattern, slot, clap: BEAT_PATTERNS[pattern]![slot] === "clap" };
  }
  const step = Math.floor(e / 3000);
  return { kind: "say", step, word: OPPOSITE_SEQ[step % OPPOSITE_SEQ.length]! };
}

/** Original synthesized booster cues on their own AudioContext. Never throws. */
export class BoosterAudio {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  enabled = true;
  volume = 0.7;
  constructor(private readonly createContext?: () => AudioContext) {}

  get activeNodes() { return this.nodes.length; }

  stop() {
    for (const n of this.nodes) {
      try { n.stop(); } catch { /* ignore */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
  }

  /** Must first be called from a user gesture (Start) so the context may resume. */
  unlock() {
    try {
      const ctx = this.ensure();
      if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
    } catch { /* audio unavailable */ }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.createContext) return (this.ctx = this.createContext());
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? (this.ctx = new Ctor()) : null;
  }

  play(cue: Cue) {
    if (!this.enabled || this.volume <= 0 || cue.kind === "done") return;
    try {
      const ctx = this.ensure();
      if (!ctx || ctx.state !== "running") return;
      this.nodes = this.nodes.slice(-12);
      const t = ctx.currentTime + 0.01;
      if (cue.kind === "move") this.tone(ctx, cue.beat % 2 ? 330 : 220, t, 0.12, 0.3, "triangle");
      else if (cue.kind === "freeze") this.tone(ctx, 880, t, 0.25, 0.2, "sine");
      else if (cue.kind === "listen") { if (cue.clap) this.tone(ctx, 1200, t, 0.06, 0.35, "square"); }
      else if (cue.kind === "copy") this.tone(ctx, 600, t, 0.04, 0.08, "sine"); // soft metronome tick
      else if (cue.kind === "say") this.tone(ctx, 660, t, 0.15, 0.2, "sine");
    } catch { /* ignore */ }
  }

  private tone(ctx: AudioContext, f: number, t: number, len: number, peak: number, type: OscillatorType) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * this.volume), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + len + 0.02);
    this.nodes.push(o);
  }

  close() {
    this.stop();
    try { void this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
  }
}
