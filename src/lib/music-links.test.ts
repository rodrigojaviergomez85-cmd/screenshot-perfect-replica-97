import { describe, expect, it } from "vitest";
import { parseSoundPrefs, sortLinks, validateYouTubeUrl } from "./music-links";

describe("YouTube link validation", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PL1234567890",
    "https://music.youtube.com/playlist?list=PL1234567890",
  ])("accepts %s", (url) => expect(validateYouTubeUrl(url).ok).toBe(true));

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/playlist",
    "https://youtu.be/",
    "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
    "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    "",
  ])("rejects %s", (url) => expect(validateYouTubeUrl(url).ok).toBe(false));

  it("normalizes to https", () => {
    const r = validateYouTubeUrl("http://youtu.be/dQw4w9WgXcQ");
    expect(r.ok && r.url.startsWith("https://youtu.be/")).toBe(true);
  });
});

describe("sound prefs restore", () => {
  it("NEXT ding defaults on, older saves stay on, saved off stays off", () => {
    expect(parseSoundPrefs(null).nextDing).toBe(true);
    expect(parseSoundPrefs(JSON.stringify({ volume: 0.3, links: [] })).nextDing).toBe(true);
    expect(parseSoundPrefs(JSON.stringify({ volume: 0.3, links: [], nextDing: false })).nextDing).toBe(false);
  });

  it("malformed JSON or missing data gives defaults", () => {
    expect(parseSoundPrefs("{bad")).toEqual({ version: 1, volume: 0.7, links: [], nextDing: true });
    expect(parseSoundPrefs(null).links).toEqual([]);
    expect(parseSoundPrefs("42").volume).toBe(0.7);
  });

  it("keeps valid links, drops invalid ones, clamps volume", () => {
    const raw = JSON.stringify({
      volume: 3,
      links: [
        { id: "a", name: "Warm-up", url: "https://youtu.be/dQw4w9WgXcQ", favorite: true, createdAt: 1 },
        { id: "b", name: "Bad", url: "https://evil.com/x", favorite: false, createdAt: 2 },
        { id: "c", name: "", url: "https://youtu.be/dQw4w9WgXcQ", createdAt: 3 },
        "junk",
      ],
    });
    const p = parseSoundPrefs(raw);
    expect(p.volume).toBe(1);
    expect(p.links.map((l) => l.id)).toEqual(["a"]);
  });

  it("favorites sort first, otherwise by creation", () => {
    const l = (id: string, favorite: boolean, createdAt: number) => ({ id, name: id, url: "u", favorite, createdAt });
    expect(sortLinks([l("a", false, 1), l("b", true, 3), l("c", false, 2)]).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});

import { loadSoundPrefs, saveSoundPrefs, SOUND_PREFS_KEY } from "./music-links";

describe("sound prefs load/save", () => {
  const mem = () => {
    const data = new Map<string, string>();
    const writes: string[] = [];
    return { data, writes, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(v); data.set(k, v); } };
  };

  it("reload restores two links, the star and volume 0.35 without writing", () => {
    const s = mem();
    const prefs = { version: 1 as const, volume: 0.35, links: [
      { id: "a", name: "Warm-up", url: "https://youtu.be/dQw4w9WgXcQ", favorite: true, createdAt: 1 },
      { id: "b", name: "Juego", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", favorite: false, createdAt: 2 },
    ], nextDing: false };
    expect(saveSoundPrefs(s, prefs)).toBe(true);
    s.writes.length = 0;
    const loaded = loadSoundPrefs(s);
    expect(loaded.readable).toBe(true);
    expect(loaded.prefs).toEqual(prefs);
    expect(s.writes).toEqual([]);
  });

  it("unreadable storage is flagged so callers never overwrite it", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadSoundPrefs(bad).readable).toBe(false);
    expect(saveSoundPrefs(bad, { version: 1, volume: 0.5, links: [], nextDing: true })).toBe(false);
    expect(SOUND_PREFS_KEY).toBe("fair-participation-sounds-v1");
  });
});

import { toEmbedUrl } from "./music-links";
describe("toEmbedUrl", () => {
  it("builds embeds only from validated ids", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0");
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&t=5")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&list=PLabc123");
    expect(toEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0");
    expect(toEmbedUrl("https://www.youtube.com/playlist?list=PLabc123")).toBe("https://www.youtube.com/embed/videoseries?playsinline=1&rel=0&list=PLabc123");
    expect(toEmbedUrl("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

import { toPlayerWrapperUrl } from "./music-links";
describe("toPlayerWrapperUrl", () => {
  it("builds a same-origin wrapper URL from validated ids only", () => {
    expect(toPlayerWrapperUrl("https://youtu.be/M7lc1UVf-VE", "https://app.example.com/x")).toBe("https://app.example.com/youtube-player.html?v=M7lc1UVf-VE");
    expect(toPlayerWrapperUrl("https://www.youtube.com/playlist?list=PLabc123", "http://localhost:8080")).toBe("http://localhost:8080/youtube-player.html?list=PLabc123");
    expect(toPlayerWrapperUrl("https://youtu.be/M7lc1UVf-VE", "about:blank")).toBeNull();
    expect(toPlayerWrapperUrl("https://evil.com/watch?v=M7lc1UVf-VE", "https://a.com")).toBeNull();
  });
});
