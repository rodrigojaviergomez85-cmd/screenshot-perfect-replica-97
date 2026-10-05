/**
 * Built-in classroom sound effects synthesized locally with Web Audio.
 * No downloads, uploads or external services: every effect is generated in the browser.
 */
export const EFFECTS = [
  { id: "aplausos", label: "Aplausos", emoji: "👏" },
  { id: "correcto", label: "Correcto", emoji: "⭐" },
  { id: "redoble", label: "Redoble", emoji: "🥁" },
  { id: "cambio", label: "Cambio", emoji: "🔔" },
  { id: "celebracion", label: "Celebración", emoji: "🎉" },
  { id: "atencion", label: "Atención", emoji: "📣" },
] as const;

export type EffectId = (typeof EFFECTS)[number]["id"];

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
    if (typeof window === "undefined") return null;
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
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { return; }
    }
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    const t = ctx.currentTime + 0.02;
    const dur = this.render(id, ctx, this.bus, t);
    this.playing = id;
    this.emit();
    this.endTimer = setTimeout(() => this.stop(), dur * 1000 + 150);
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
      case "aplausos": {
        // Many overlapping hand claps that swell then fade.
        const total = 2.2;
        for (let i = 0; i < 90; i++) {
          const at = Math.random() * total;
          const env = Math.sin((at / total) * Math.PI);
          this.burst(ctx, out, t + at, 0.06 + Math.random() * 0.04, 0.15 + env * 0.35, 900 + Math.random() * 1600, 0.8);
        }
        return total + 0.15;
      }
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
