/** YouTube favorite links + effect volume, saved once per browser (shared by all classes). */
export const SOUND_PREFS_KEY = "fair-participation-sounds-v1";

export type MusicLink = { id: string; name: string; url: string; favorite: boolean; createdAt: number };
export type SoundPrefs = { version: 1; volume: number; links: MusicLink[]; nextDing: boolean };

export const DEFAULT_SOUND_PREFS: SoundPrefs = { version: 1, volume: 0.7, links: [], nextDing: true };

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

export function validateYouTubeUrl(input: string): UrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Pega un enlace de YouTube." };
  if (raw.length > 500) return { ok: false, error: "El enlace es demasiado largo." };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "No parece un enlace válido." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Solo se permiten enlaces https de YouTube." };
  if (u.username || u.password || u.port) return { ok: false, error: "Solo se permiten enlaces de YouTube." };
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { ok: false, error: "Solo se permiten enlaces de youtube.com o youtu.be." };
  const parts = u.pathname.split("/").filter(Boolean);
  const v = u.searchParams.get("v");
  const list = u.searchParams.get("list");
  let valid = false;
  if (host === "youtu.be") {
    valid = parts.length === 1 && VIDEO_ID.test(parts[0]!);
  } else if (parts[0] === "watch" && parts.length === 1) {
    valid = (v !== null && VIDEO_ID.test(v)) || (v === null && list !== null && LIST_ID.test(list));
  } else if (parts[0] === "playlist" && parts.length === 1) {
    valid = list !== null && LIST_ID.test(list);
  } else if (["shorts", "live", "embed"].includes(parts[0] ?? "") && parts.length === 2) {
    valid = VIDEO_ID.test(parts[1]!);
  }
  if (!valid) return { ok: false, error: "Falta el video o la lista en el enlace de YouTube." };
  u.protocol = "https:";
  u.hash = "";
  return { ok: true, url: u.toString() };
}

export function sortLinks(links: MusicLink[]): MusicLink[] {
  return [...links].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.createdAt - b.createdAt);
}

type KV = Pick<Storage, "getItem" | "setItem">;

/** Reads prefs once. readable=false means storage threw, so callers must never overwrite it. */
export function loadSoundPrefs(storage: KV | null): { prefs: SoundPrefs; readable: boolean; raw: string | null } {
  if (!storage) return { prefs: parseSoundPrefs(null), readable: false, raw: null };
  try {
    const raw = storage.getItem(SOUND_PREFS_KEY);
    return { prefs: parseSoundPrefs(raw), readable: true, raw };
  } catch {
    return { prefs: parseSoundPrefs(null), readable: false, raw: null };
  }
}

/** Returns false when the browser refused the write. */
export function saveSoundPrefs(storage: KV | null, prefs: SoundPrefs): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Parses stored prefs defensively; anything malformed falls back to defaults item by item. */
export function parseSoundPrefs(raw: string | null): SoundPrefs {
  if (!raw) return { ...DEFAULT_SOUND_PREFS, links: [] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SOUND_PREFS, links: [] };
  }
  if (!data || typeof data !== "object") return { ...DEFAULT_SOUND_PREFS, links: [] };
  const d = data as { volume?: unknown; links?: unknown; nextDing?: unknown };
  const volume = typeof d.volume === "number" && Number.isFinite(d.volume) ? Math.min(1, Math.max(0, d.volume)) : DEFAULT_SOUND_PREFS.volume;
  const links: MusicLink[] = [];
  const seen = new Set<string>();
  if (Array.isArray(d.links)) {
    for (const item of d.links.slice(0, 100)) {
      if (!item || typeof item !== "object") continue;
      const l = item as Record<string, unknown>;
      if (typeof l["id"] !== "string" || typeof l["name"] !== "string" || typeof l["url"] !== "string") continue;
      const name = l["name"].trim().slice(0, 60);
      const check = validateYouTubeUrl(l["url"]);
      if (!name || !check.ok || seen.has(l["id"])) continue;
      seen.add(l["id"]);
      links.push({
        id: l["id"],
        name,
        url: check.url,
        favorite: l["favorite"] === true,
        createdAt: typeof l["createdAt"] === "number" ? l["createdAt"] : 0,
      });
    }
  }
  return { version: 1, volume, links, nextDing: d.nextDing !== false };
}

/**
 * Builds the official YouTube embed URL from an already-validated link, using only
 * the validated video/playlist ids. Returns null if the link cannot be embedded.
 */
export function toEmbedUrl(input: string): string | null {
  const check = validateYouTubeUrl(input);
  if (!check.ok) return null;
  const u = new URL(check.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const listRaw = u.searchParams.get("list");
  const list = listRaw && LIST_ID.test(listRaw) ? listRaw : null;
  let id: string | null = null;
  if (u.hostname === "youtu.be") id = parts[0] ?? null;
  else if (parts[0] === "watch") id = u.searchParams.get("v");
  else if (["shorts", "live", "embed"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  if (id && !VIDEO_ID.test(id)) id = null;
  const params = new URLSearchParams({ playsinline: "1", rel: "0" });
  if (id) {
    if (list) params.set("list", list);
    return `https://www.youtube.com/embed/${id}?${params}`;
  }
  if (!list) return null;
  params.set("list", list);
  return `https://www.youtube.com/embed/videoseries?${params}`;
}

/**
 * Same-origin wrapper page URL (public/youtube-player.html). Inside Document PiP the
 * document is about:blank, so a direct YouTube iframe gets no valid Referer (Error 153);
 * the wrapper is a real app-origin page that hosts the official embed instead.
 */
export function toPlayerWrapperUrl(input: string, appOrigin: string): string | null {
  const embed = toEmbedUrl(input);
  if (!embed) return null;
  let origin: string;
  try {
    const o = new URL(appOrigin);
    if (o.protocol !== "https:" && o.protocol !== "http:") return null;
    origin = o.origin;
  } catch {
    return null;
  }
  const e = new URL(embed);
  const id = e.pathname.split("/").filter(Boolean)[1];
  const list = e.searchParams.get("list");
  const params = new URLSearchParams();
  if (id && id !== "videoseries") params.set("v", id);
  if (list) params.set("list", list);
  return `${origin}/youtube-player.html?${params}`;
}
