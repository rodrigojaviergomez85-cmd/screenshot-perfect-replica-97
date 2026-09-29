import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Row = { id: string; name: string; checked: boolean };

const UI_TEXT = [
  /^participants?\b/i,
  /find a participant/i,
  /^invite\b/i,
  /mute all/i,
  /unmute all/i,
  /^more\b/i,
  /^chat$/i,
  /^rename$/i,
  /waiting room/i,
  /in the meeting/i,
];

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function cleanOcr(text: string): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || !/\p{L}/u.test(line)) continue;
    if (UI_TEXT.some((r) => r.test(line))) continue;
    const isCoach = /coach|\((me|host|co-host)\)/i.test(line);
    let name = line
      .replace(/\((me|host|co-host|guest)[^)]*\)/gi, "")
      .replace(/[^\p{L}\p{M}'.\- ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || !/\p{L}{2}/u.test(name)) continue;
    if (name === name.toUpperCase() && /\p{Lu}/u.test(name)) name = titleCase(name);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: Math.random().toString(36).slice(2), name, checked: !isCoach });
  }
  return rows;
}

async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1200 ? 2 : 1;
  const c = document.createElement("canvas");
  c.width = bmp.width * scale;
  c.height = bmp.height * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  if (sum / (d.length / 4) < 128) {
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i]!;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function ZoomImport({ onAdd }: { onAdd: (names: string[]) => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (file: Blob) => {
    setStatus("loading");
    setRows([]);
    try {
      const canvas = await preprocess(file);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const found = cleanOcr(data.text);
      setRows(found);
      setStatus(found.length ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        void run(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [run]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
          if (f) void run(f);
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-input"}`}
      >
        <p className="text-sm font-semibold">
          Paste a screenshot of the Zoom participants list (Ctrl+V), or drop / upload an image.
        </p>
        <Button variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="mr-1 h-4 w-4" /> Upload image
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f);
            e.target.value = "";
          }}
        />
        {status === "loading" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading names…
          </p>
        )}
        {status === "error" && (
          <p className="text-sm font-semibold text-destructive">
            Couldn't read any names. Try a clearer screenshot or type them below.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-input p-3">
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={(e) => update(r.id, { checked: e.target.checked })}
                  className="size-5 accent-[var(--color-primary)]"
                  aria-label={`Include ${r.name}`}
                />
                <input
                  value={r.name}
                  onChange={(e) => update(r.id, { name: e.target.value })}
                  className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            className="rounded-xl"
            onClick={() => {
              onAdd(rows.filter((r) => r.checked && r.name.trim()).map((r) => r.name.trim()));
              setRows([]);
            }}
          >
            Add checked names to roster
          </Button>
        </div>
      )}
    </div>
  );
}
