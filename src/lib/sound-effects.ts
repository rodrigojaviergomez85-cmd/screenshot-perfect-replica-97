/**
 * Built-in classroom sound effects played locally with Web Audio.
 * Most are synthesized; Aplausos uses a CC0 recording bundled with the app (no third-party requests).
 */
import applauseAsset from "@/assets/applause-congratulations.mp3.asset.json";
export const EFFECTS = [
  { id: "aplausos", label: "Aplausos", emoji: "👏" },
  { id: "correcto", label: "Correcto", emoji: "⭐" },
  { id: "redoble", label: "Redoble", emoji: "🥁" },
  { id: "cambio", label: "Cambio", emoji: "🔔" },
  { id: "celebracion", label: "Celebración", emoji: "🎉" },
  { id: "atencion", label: "Atención", emoji: "📣" },
] as const;

export type EffectId = (typeof EFFECTS)[number]["id"];

/** Effects backed by a recorded clip bundled with the app (see src/assets/ATTRIBUTION.md). */
const CLIP_URLS: Partial<Record<EffectId, string>> = { aplausos: applauseAsset.url };

export type ClipLoader = (ctx: AudioContext, url: string) => Promise<AudioBuffer>;

const defaultLoadClip: ClipLoader = async (ctx, url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`clip ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
};

type Listener = (playing: EffectId | null) => void;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private bus: GainNode | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private volume = 0.7;
  private noise: AudioBuffer | null = null;
  playing: EffectId | null = null;
  private listeners = new Set<Listener>();
  /** Bumped by every play() and stop(); a play only renders if its token is still current. */
  private generation = 0;
  private clips = new Map<string, Promise<AudioBuffer>>();
  private readonly loadClip: ClipLoader;

  constructor(private readonly createContext?: () => AudioContext, loadClip?: ClipLoader) {
    this.loadClip = loadClip ?? defaultLoadClip;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.playing));
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx && this.createContext) {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * 2), this.ctx.sampleRate);
    }
    if (!this.ctx && typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.ctx;
  }

  stop() {
    this.generation++;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    for (const n of this.nodes) {
      try { n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
    if (this.bus) {
      try { this.bus.disconnect(); } catch { /* ignore */ }
      this.bus = null;
    }
    if (this.playing !== null) {
      this.playing = null;
      this.emit();
    }
  }

  /** Must be called from a user click. Replaces any effect already playing. */
  async play(id: EffectId) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.stop();
    const token = ++this.generation;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { return; }
      // A newer play or a stop happened while resuming: this click is obsolete.
      if (token !== this.generation) return;
    }
    let clip: AudioBuffer | null = null;
    const url = CLIP_URLS[id];
    if (url) {
      try { clip = await this.getClip(ctx, url); } catch { return; }
      // Stop / newer click during fetch+decode: never play late.
      if (token !== this.generation) return;
    }
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    const t = ctx.currentTime + 0.02;
    let dur: number;
    if (clip) {
      const s = ctx.createBufferSource();
      s.buffer = clip;
      s.connect(this.bus);
      s.start(t);
      this.nodes.push(s);
      dur = clip.duration;
    } else {
      dur = this.render(id, ctx, this.bus, t);
    }
    this.playing = id;
    this.emit();
    this.endTimer = setTimeout(() => this.stop(), dur * 1000 + 150);
  }

  /** Fetch + decode once and cache; a failed load is evicted so the next click retries. */
  private getClip(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    let p = this.clips.get(url);
    if (!p) {
      p = this.loadClip(ctx, url);
      this.clips.set(url, p);
      p.catch(() => { if (this.clips.get(url) === p) this.clips.delete(url); });
    }
    return p;
  }

  private tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, start: number, len: number, peak: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + len + 0.05);
    this.nodes.push(o);
    return o;
  }

  private burst(ctx: AudioContext, out: AudioNode, start: number, len: number, peak: number, freq: number, q = 1) {
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    s.connect(f).connect(g).connect(out);
    s.start(start, Math.random() * 1.5);
    s.stop(start + len + 0.05);
    this.nodes.push(s);
  }

  private render(id: EffectId, ctx: AudioContext, out: AudioNode, t: number): number {
    switch (id) {
      case "aplausos":
        return 0; // recorded clip; see CLIP_URLS
      case "correcto": {
        this.tone(ctx, out, "sine", 659.25, t, 0.25, 0.4);
        this.tone(ctx, out, "sine", 987.77, t + 0.12, 0.5, 0.4);
        this.tone(ctx, out, "triangle", 1318.5, t + 0.12, 0.4, 0.08);
        return 0.7;
      }
      case "redoble": {
        // Accelerating snare roll, then a cymbal-like crash and low hit.
        let at = 0;
        let gap = 0.09;
        while (at < 1.6) {
          this.burst(ctx, out, t + at, 0.07, 0.25 + (at / 1.6) * 0.3, 1800, 0.6);
          this.tone(ctx, out, "triangle", 180, t + at, 0.05, 0.08);
          at += gap;
          gap = Math.max(0.035, gap * 0.95);
        }
        this.tone(ctx, out, "sine", 90, t + 1.65, 0.6, 0.6);
        this.burst(ctx, out, t + 1.65, 1.3, 0.35, 6000, 0.4);
        return 3.0;
      }
      case "cambio": {
        // Single bell strike with inharmonic partials.
        this.tone(ctx, out, "sine", 880, t, 1.6, 0.35);
        this.tone(ctx, out, "sine", 880 * 2.76, t, 0.9, 0.12);
        this.tone(ctx, out, "sine", 880 * 5.4, t, 0.4, 0.05);
        return 1.7;
      }
      case "celebracion": {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(ctx, out, "triangle", f, t + i * 0.1, 0.3, 0.3));
        [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(ctx, out, "triangle", f, t + 0.45, 0.9, 0.14));
        for (let i = 0; i < 14; i++) this.tone(ctx, out, "sine", 2000 + Math.random() * 2500, t + 0.45 + Math.random() * 0.7, 0.12, 0.05);
        return 1.5;
      }
      case "atencion": {
        // Two-tone "ding-dong" call for attention.
        this.tone(ctx, out, "sine", 783.99, t, 0.7, 0.35);
        this.tone(ctx, out, "sine", 783.99 * 3, t, 0.3, 0.05);
        this.tone(ctx, out, "sine", 622.25, t + 0.4, 1.0, 0.35);
        this.tone(ctx, out, "sine", 622.25 * 3, t + 0.4, 0.4, 0.05);
        return 1.5;
      }
    }
  }
}

/**
 * Short original two-note "next" ding, on its own AudioContext so it never stops
 * soundboard effects or YouTube. Rapid repeats replace the previous ding; disabling
 * cancels a ding still waiting on resume. Never throws or rejects.
 */
export class NextDing {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private generation = 0;
  enabled = true;
  played = 0;
  constructor(private readonly createContext?: () => AudioContext) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.cancel();
  }

  cancel() {
    this.generation++;
    for (const n of this.nodes) {
      try { n.stop(); } catch { /* ignore */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
  }

  async play(): Promise<void> {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        if (this.createContext) this.ctx = this.createContext();
        else {
          if (typeof window === "undefined") return;
          const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return;
          this.ctx = new Ctor();
        }
      }
      const ctx = this.ctx;
      this.cancel();
      const token = this.generation;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { return; }
      }
      if (token !== this.generation || !this.enabled) return;
      const t = ctx.currentTime + 0.01;
      // C6 then G6, soft sine with a faint triangle shimmer (~320 ms total).
      ([[1046.5, 0, 0.14], [1567.98, 0.1, 0.22]] as const).forEach(([f, at, len]) => {
        for (const [type, peak, mul] of [["sine", 0.22, 1], ["triangle", 0.04, 2]] as const) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = type;
          o.frequency.setValueAtTime(f * mul, t + at);
          g.gain.setValueAtTime(0.0001, t + at);
          g.gain.exponentialRampToValueAtTime(peak, t + at + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
          o.connect(g).connect(ctx.destination);
          o.start(t + at);
          o.stop(t + at + len + 0.03);
          this.nodes.push(o);
        }
      });
      this.played++;
    } catch { /* audio unavailable: NEXT must never be blocked */ }
  }
}
