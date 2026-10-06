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

describe("recorded applause clip", () => {
  function running() { const f = fakeCtx(); f.ctx.state = "running"; return f; }
  const buf = { duration: 3 } as AudioBuffer;

  it("stop during fetch/decode never plays late", async () => {
    const f = running();
    let done!: (b: AudioBuffer) => void;
    const e = new SoundEngine(() => f.ctx as unknown as AudioContext, () => new Promise((r) => { done = r; }));
    const p = e.play("aplausos");
    await Promise.resolve();
    e.stop();
    done(buf);
    await p;
    expect(f.ctx.sources).toBe(0);
    expect(e.playing).toBeNull();
  });

  it("a newer click during load wins", async () => {
    const f = running();
    let done!: (b: AudioBuffer) => void;
    const e = new SoundEngine(() => f.ctx as unknown as AudioContext, () => new Promise((r) => { done = r; }));
    const a = e.play("aplausos");
    await Promise.resolve();
    const b = e.play("correcto");
    done(buf);
    await Promise.all([a, b]);
    expect(e.playing).toBe("correcto");
    expect(f.ctx.sources).toBe(3);
    e.stop();
  });

  it("load failure plays nothing, then retries and caches", async () => {
    const f = running();
    let calls = 0;
    const e = new SoundEngine(() => f.ctx as unknown as AudioContext, async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return buf;
    });
    await e.play("aplausos");
    expect(e.playing).toBeNull();
    expect(f.ctx.sources).toBe(0);
    await e.play("aplausos");
    expect(e.playing).toBe("aplausos");
    expect(f.ctx.sources).toBe(1);
    await e.play("aplausos");
    expect(calls).toBe(2);
    e.stop();
  });
});

import { NextDing } from "./sound-effects";
describe("next ding", () => {
  it("disabling during resume cancels the ding", async () => {
    const f = fakeCtx();
    const d = new NextDing(() => f.ctx as unknown as AudioContext);
    const p = d.play();
    d.setEnabled(false);
    f.resolveResume();
    await p;
    expect(f.ctx.sources).toBe(0);
  });
  it("disabled plays nothing; rejected resume never throws", async () => {
    const f = fakeCtx();
    const d = new NextDing(() => f.ctx as unknown as AudioContext);
    d.setEnabled(false);
    await d.play();
    expect(f.ctx.sources).toBe(0);
    d.setEnabled(true);
    f.ctx.resume = () => Promise.reject(new Error("no"));
    await expect(d.play()).resolves.toBeUndefined();
    expect(d.played).toBe(0);
  });
  it("rapid repeats do not stack: only the last pending plays", async () => {
    const f = fakeCtx();
    const resumes: (() => void)[] = [];
    f.ctx.resume = () => new Promise<void>((r) => resumes.push(() => { f.ctx.state = "running"; r(); }));
    const d = new NextDing(() => f.ctx as unknown as AudioContext);
    const a = d.play(); const b = d.play();
    resumes.forEach((r) => r());
    await Promise.all([a, b]);
    expect(d.played).toBe(1);
    expect(f.ctx.sources).toBe(4);
  });
});
