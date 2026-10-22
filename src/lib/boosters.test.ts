import { describe, expect, it } from "vitest";
import { BoosterAudio, BoosterClock, boosterCue, BOOSTERS } from "./boosters";

describe("booster clock", () => {
  it("pause holds elapsed time and resume continues without restarting", () => {
    let t = 1000;
    const c = new BoosterClock(() => t);
    c.start();
    t += 4000;
    c.pause();
    t += 10000; // paused time never counts
    expect(c.elapsedMs()).toBe(4000);
    c.resume();
    t += 1500;
    expect(c.elapsedMs()).toBe(5500);
    c.stop();
    expect(c.elapsedMs()).toBe(0);
    expect(c.running).toBe(false);
  });
});

describe("booster cues", () => {
  it("durations are 30s, 20s, 30s and every exercise completes", () => {
    expect(BOOSTERS.map((b) => b.seconds)).toEqual([30, 20, 30]);
    for (const b of BOOSTERS) {
      expect(boosterCue(b.id, b.seconds * 1000 - 1).kind).not.toBe("done");
      expect(boosterCue(b.id, b.seconds * 1000).kind).toBe("done");
    }
  });

  it("Move & Freeze: MOVE for 5s then FREEZE for 3s", () => {
    expect(boosterCue("freeze", 0).kind).toBe("move");
    expect(boosterCue("freeze", 4999).kind).toBe("move");
    expect(boosterCue("freeze", 5000).kind).toBe("freeze");
    expect(boosterCue("freeze", 7999).kind).toBe("freeze");
    expect(boosterCue("freeze", 8000).kind).toBe("move");
  });

  it("Copy My Beat: three patterns, listen then copy", () => {
    expect(boosterCue("beat", 0)).toMatchObject({ kind: "listen", pattern: 0, slot: 0, clap: true });
    expect(boosterCue("beat", 1700)).toMatchObject({ kind: "listen", pattern: 0, slot: 2, clap: false });
    expect(boosterCue("beat", 3300)).toMatchObject({ kind: "copy", pattern: 0 });
    expect(boosterCue("beat", 6500)).toMatchObject({ kind: "listen", pattern: 1, slot: 0 });
    expect(boosterCue("beat", 12900)).toMatchObject({ kind: "listen", pattern: 2 });
  });

  it("Opposite: a new command every 3s", () => {
    const a = boosterCue("opposite", 0);
    const b = boosterCue("opposite", 3000);
    expect(a.kind === "say" && b.kind === "say" && a.step !== b.step).toBe(true);
  });
});

describe("booster audio", () => {
  const ctx = () => {
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    const node = () => { const n: Record<string, unknown> = { gain: param, frequency: param, type: "" }; n["connect"] = () => n; n["disconnect"] = () => {}; n["start"] = () => {}; n["stop"] = () => {}; return n; };
    return { state: "running", currentTime: 0, destination: node(), createOscillator: node, createGain: node, resume: async () => {}, close: async () => {} } as unknown as AudioContext;
  };
  it("stop clears every scheduled node; sound-off plays nothing", () => {
    const a = new BoosterAudio(ctx);
    a.play({ kind: "move", step: 0, beat: 0 });
    expect(a.activeNodes).toBe(1);
    a.stop();
    expect(a.activeNodes).toBe(0);
    a.enabled = false;
    a.play({ kind: "say", step: 1, word: "UP" });
    expect(a.activeNodes).toBe(0);
  });
});
