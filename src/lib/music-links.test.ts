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
  it("malformed JSON or missing data gives defaults", () => {
    expect(parseSoundPrefs("{bad")).toEqual({ version: 1, volume: 0.7, links: [] });
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
