import { describe, expect, it } from "vitest";
import { SoundEngine } from "./sound-effects";

function param() { return { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
function node() {
  const n: Record<string, unknown> = { gain: param(), frequency: param(), Q: param(), type: "", buffer: null };
  n["connect"] = () => n; n["disconnect"] = () => {}; n["start"] = () => {}; n["stop"] = () => {};
  return n;
}
function fakeCtx() {
  let resolve!: () => void;
  const ctx = {
    state: "suspended", currentTime: 0, sampleRate: 100, destination: node(), sources: 0,
    resume: () => new Promise<void>((r) => { resolve = () => { ctx.state = "running"; r(); }; }),
    createGain: node, createBiquadFilter: node,
    createOscillator: () => { ctx.sources++; return node(); },
    createBufferSource: () => { ctx.sources++; return node(); },
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
  };
  return { ctx, resolveResume: () => resolve() };
}

describe("sound engine delayed resume", () => {
  it("stop during resume cancels the pending effect", async () => {
    const f = fakeCtx();
    const e = new SoundEngine(() => f.ctx as unknown as AudioContext);
    const p = e.play("redoble");
    e.stop();
    f.resolveResume();
    await p;
    expect(f.ctx.sources).toBe(0);
    expect(e.playing).toBeNull();
  });

  it("only the last click plays when two plays wait on resume", async () => {
    const f = fakeCtx();
    const e = new SoundEngine(() => f.ctx as unknown as AudioContext);
    const resumes: (() => void)[] = [];
    f.ctx.resume = () => new Promise<void>((r) => resumes.push(() => { f.ctx.state = "running"; r(); }));
    const a = e.play("redoble");
    const b = e.play("correcto");
    resumes.forEach((r) => r());
    await Promise.all([a, b]);
    expect(e.playing).toBe("correcto");
    expect(f.ctx.sources).toBe(3); // correcto = 3 oscillators; redoble never rendered
    e.stop();
  });
});
