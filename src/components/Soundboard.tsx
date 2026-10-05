import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Pencil, Plus, Square, Star, Trash2, Volume1, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EFFECTS, type EffectId } from "@/lib/sound-effects";
import { sortLinks, validateYouTubeUrl, type MusicLink } from "@/lib/music-links";

type Props = {
  playing: EffectId | null;
  onPlay: (id: EffectId) => void;
  onStop: () => void;
  volume: number;
  onVolume: (v: number) => void;
  links: MusicLink[];
  onLinksChange: (links: MusicLink[]) => void;
  backLabel: string;
  onBack: () => void;
  footer: ReactNode;
};

type Draft = { id: string | null; name: string; url: string; error: string | null };

export function Soundboard({ playing, onPlay, onStop, volume, onVolume, links, onLinksChange, backLabel, onBack, footer }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [undo, setUndo] = useState<{ link: MusicLink; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim().slice(0, 60);
    if (!name) return setDraft({ ...draft, error: "Escribe un nombre." });
    const check = validateYouTubeUrl(draft.url);
    if (!check.ok) return setDraft({ ...draft, error: check.error });
    if (draft.id) {
      onLinksChange(links.map((l) => (l.id === draft.id ? { ...l, name, url: check.url } : l)));
    } else {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      onLinksChange([...links, { id, name, url: check.url, favorite: false, createdAt: Date.now() }]);
    }
    setDraft(null);
  };

  const remove = (link: MusicLink) => {
    const index = links.findIndex((l) => l.id === link.id);
    onLinksChange(links.filter((l) => l.id !== link.id));
    setUndo({ link, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };

  const restore = () => {
    if (!undo) return;
    const next = [...links];
    next.splice(Math.min(undo.index, next.length), 0, undo.link);
    onLinksChange(next);
    setUndo(null);
  };

  const onFormKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
  };

  const playingLabel = EFFECTS.find((e) => e.id === playing)?.label;

  return (
    <div data-soundboard className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <Button size="sm" variant="outline" className="h-8 rounded-lg px-2 text-xs font-bold" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-destructive px-2 text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onStop}
          aria-label="Parar sonidos"
        >
          <Square className="h-3 w-3 fill-current" /> Parar sonidos
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-2">
        <section aria-label="Sonidos rápidos">
          <h2 className="mb-1.5 font-[family-name:var(--font-display)] text-sm font-extrabold">Sonidos rápidos</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {EFFECTS.map((e) => {
              const active = playing === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => onPlay(e.id)}
                  aria-pressed={active}
                  aria-label={active ? `${e.label}, sonando` : `Reproducir ${e.label}`}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-xs font-bold transition-colors ${active ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-accent/60"}`}
                >
                  <span className={`text-2xl leading-none ${active ? "animate-pulse" : ""}`} aria-hidden>{e.emoji}</span>
                  <span className="truncate">{e.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Efectos</span>
            <Volume1 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => onVolume(Number(e.target.value) / 100)}
              aria-label="Volumen de efectos"
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>
          <p className="mt-1 h-4 text-xs font-semibold text-accent-foreground" aria-live="polite">
            {playingLabel ? `Sonando: ${playingLabel}` : ""}
          </p>
        </section>

        <section aria-label="Mi música" className="border-t border-border pt-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold">Mi música</h2>
            {!draft && (
              <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-xs font-bold" onClick={() => setDraft({ id: null, name: "", url: "", error: null })}>
                <Plus className="h-3.5 w-3.5" /> Agregar enlace
              </Button>
            )}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">Las canciones se abren en YouTube. Pausa y volumen se controlan allí.</p>

          {draft && (
            <div className="mb-2 space-y-1.5 rounded-xl border border-border bg-card p-2" onKeyDown={onFormKey}>
              <label className="block text-xs font-bold">
                Nombre
                <input
                  autoFocus
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value, error: null })}
                  className="mt-0.5 block w-full rounded-lg border border-input bg-background px-2 py-1 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold">
                Enlace de YouTube
                <input
                  value={draft.url}
                  maxLength={500}
                  inputMode="url"
                  placeholder="https://youtu.be/…"
                  onChange={(e) => setDraft({ ...draft, url: e.target.value, error: null })}
                  aria-invalid={!!draft.error}
                  className="mt-0.5 block w-full rounded-lg border border-input bg-background px-2 py-1 text-sm font-normal"
                />
              </label>
              {draft.error && <p role="alert" className="text-xs font-semibold text-destructive">{draft.error}</p>}
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDraft(null)}>Cancelar</Button>
                <Button size="sm" className="h-7 px-3 text-xs font-bold" onClick={save}>Guardar</Button>
              </div>
            </div>
          )}

          {undo && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
              <span className="truncate">Eliminado: {undo.link.name}</span>
              <button className="font-bold underline" onClick={restore}>Deshacer</button>
            </div>
          )}

          {links.length === 0 && !draft ? (
            <p className="rounded-xl border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
              Aún no hay canciones. Agrega tu primer enlace de YouTube.
            </p>
          ) : (
            <ul className="space-y-1">
              {sortLinks(links).map((l) => (
                <li key={l.id} className="flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={l.name}>{l.name}</span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-primary hover:bg-accent"
                    aria-label={`Abrir ${l.name} en YouTube`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir en YouTube
                  </a>
                  <button
                    onClick={() => onLinksChange(links.map((x) => (x.id === l.id ? { ...x, favorite: !x.favorite } : x)))}
                    aria-pressed={l.favorite}
                    aria-label={l.favorite ? `Quitar ${l.name} de favoritos` : `Marcar ${l.name} como favorito`}
                    className="shrink-0 rounded-md p-1 text-primary hover:bg-accent"
                  >
                    <Star className={`h-4 w-4 ${l.favorite ? "fill-current" : ""}`} />
                  </button>
                  <button onClick={() => setDraft({ id: l.id, name: l.name, url: l.url, error: null })} aria-label={`Editar ${l.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(l)} aria-label={`Eliminar ${l.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-border px-3 py-2">{footer}</div>
    </div>
  );
}
