import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BEAT_PATTERNS, BOOSTERS, BoosterAudio, BoosterClock, boosterCue, boosterSeconds, OPPOSITE, type BoosterId, type Cue } from "@/lib/boosters";

type Props = {
  volume: number;
  /** Called once per explicit Start: pause the class timer and stop other panel audio. */
  onStart: () => void;
  /** Lets the parent stop the booster (NEXT/X, Stop) before running its own handler. */
  registerStop: (stop: (() => void) | null) => void;
  onActiveChange: (active: boolean) => void;
  /** Finish / Back to class: return to the view that opened the panel (class stays paused). */
  onBackToClass: () => void;
};

type Status = "ready" | "running" | "paused" | "done";

export function Boosters({ volume, onStart, registerStop, onActiveChange, onBackToClass }: Props) {
  const [selected, setSelected] = useState<BoosterId | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const clock = useRef(new BoosterClock());
  const audio = useRef<BoosterAudio | null>(null);
  if (!audio.current) audio.current = new BoosterAudio();
  const lastStep = useRef(-1);

  audio.current.volume = volume;
  audio.current.enabled = soundOn;

  const halt = () => {
    clock.current.stop();
    audio.current!.stop();
    lastStep.current = -1;
  };

  // Stop everything on unmount (tab change, back, closing PiP).
  useEffect(() => {
    const a = audio.current!;
    const c = clock.current;
    return () => { c.stop(); a.close(); };
  }, []);

  useEffect(() => {
    const active = status === "running" || status === "paused";
    onActiveChange(active);
    // External stop (NEXT/X/manual/mode/Stop) is an interruption, not a completion: back to the menu.
    registerStop(active ? () => { console.log("EXTSTOP"); halt(); setStatus("ready"); setSelected(null); setElapsed(0); } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  useEffect(() => () => { registerStop(null); onActiveChange(false); }, [registerStop, onActiveChange]);

  useEffect(() => {
    if (status !== "running" || !selected) return;
    const id = window.setInterval(() => {
      const e = clock.current.elapsedMs();
      const cue = boosterCue(selected, e);
      if (cue.kind === "done") {
        halt();
        setElapsed(boosterSeconds(selected) * 1000);
        console.log("NATDONE", clock.current.elapsedMs()); setStatus("done");
        return;
      }
      if (cue.step !== lastStep.current || (cue.kind === "move" && cue.beat !== beatRef.current)) {
        lastStep.current = cue.step;
        if (cue.kind === "move") beatRef.current = cue.beat;
        audio.current!.play(cue);
      }
      setElapsed(e);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, selected]);
  const beatRef = useRef(-1);

  const start = () => {
    if (!selected) return;
    onStart();
    audio.current!.unlock();
    lastStep.current = -1;
    beatRef.current = -1;
    clock.current.start();
    setElapsed(0);
    setStatus("running");
  };
  const togglePause = () => {
    if (status === "running") { clock.current.pause(); audio.current!.stop(); setStatus("paused"); }
    else if (status === "paused") { clock.current.resume(); setStatus("running"); }
  };
  const finish = () => { halt(); setStatus("done"); onBackToClass(); };
  const back = () => { halt(); setStatus("ready"); setSelected(null); setElapsed(0); };

  if (!selected) {
    return (
      <ul className="space-y-1.5" aria-label="Boosters">
        {BOOSTERS.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => { setSelected(b.id); setStatus("ready"); setElapsed(0); }}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 text-left hover:bg-accent/60"
              aria-label={`${b.title}, ${b.seconds} segundos`}
            >
              <span className="text-2xl leading-none" aria-hidden>{b.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-[family-name:var(--font-display)] text-sm font-extrabold">{b.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{b.es} · todos juntos, sentados o de pie</span>
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{b.seconds}s</span>
              <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-xs font-extrabold text-primary-foreground">Start</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const b = BOOSTERS.find((x) => x.id === selected)!;
  const total = b.seconds * 1000;
  const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
  const cue: Cue = status === "done" ? { kind: "done" } : boosterCue(selected, elapsed);

  return (
    <section className="flex flex-col gap-2" aria-label={b.title}>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-xs font-bold" onClick={back} aria-label="Volver a boosters">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-sm font-extrabold">{b.emoji} {b.title} <span className="text-xs font-semibold text-muted-foreground">· {b.es}</span></p>
        <button
          type="button"
          onClick={() => { setSoundOn((s) => !s); if (soundOn) audio.current!.stop(); }}
          aria-pressed={soundOn}
          aria-label="Sonido del booster"
          title={soundOn ? "Sonido del booster: on" : "Sonido del booster: off"}
          className={`shrink-0 rounded-md p-1 ${soundOn ? "text-primary" : "text-muted-foreground"}`}
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        <span className="shrink-0 font-[family-name:var(--font-display)] text-lg font-extrabold tabular-nums" aria-label={`${left} segundos restantes`}>{left}s</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
      </div>

      <div className="flex min-h-[96px] flex-col items-center justify-center rounded-xl border border-border bg-card px-2 py-2 text-center" aria-live="polite">
        {status === "ready" ? (
          <>
            <p className="font-[family-name:var(--font-display)] text-xl font-extrabold">Ready?</p>
            <p className="text-xs text-muted-foreground">{readyText(selected)}</p>
          </>
        ) : cue.kind === "done" ? (
          <>
            <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-primary">Great job!</p>
            <p className="text-xs text-muted-foreground">¡Buen trabajo! La clase sigue en pausa.</p>
          </>
        ) : (
          <CueView cue={cue} />
        )}
      </div>

      <div className="flex gap-1.5">
        {status === "ready" && (
          <Button className="h-9 flex-1 rounded-xl font-extrabold" onClick={start}><Play className="h-4 w-4" /> Start</Button>
        )}
        {(status === "running" || status === "paused") && (
          <Button variant="outline" className="h-9 flex-1 rounded-xl font-bold" onClick={togglePause}>
            {status === "running" ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
          </Button>
        )}
        {status !== "ready" && (
          <Button variant={status === "done" ? "default" : "outline"} className="h-9 flex-1 rounded-xl font-bold" onClick={finish}>
            {status === "done" ? "Back to class" : "Finish"}
          </Button>
        )}
      </div>
    </section>
  );
}

function readyText(id: BoosterId) {
  if (id === "freeze") return "Muévanse con la música; cuando diga FREEZE, ¡quietos como estatuas!";
  if (id === "beat") return "Escuchen el ritmo y luego repítanlo con palmas.";
  return "Digo una dirección; ustedes hacen lo contrario.";
}

function CueView({ cue }: { cue: Cue }) {
  if (cue.kind === "move" || cue.kind === "freeze") {
    const move = cue.kind === "move";
    return (
      <>
        <p className={`font-[family-name:var(--font-display)] text-5xl font-extrabold leading-none ${move ? "text-primary" : "text-accent-foreground"}`}>{move ? "MOVE!" : "FREEZE!"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{move ? "¡Muévanse!" : "¡Congélense!"}</p>
      </>
    );
  }
  if (cue.kind === "listen" || cue.kind === "copy") {
    const pattern = BEAT_PATTERNS[cue.pattern]!;
    return (
      <>
        <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none text-primary">{cue.kind === "listen" ? "LISTEN" : "YOUR TURN!"}</p>
        <p className="mb-1 text-xs text-muted-foreground">{cue.kind === "listen" ? "Escuchen al coach" : "Ahora ustedes"} · ritmo {cue.pattern + 1}/3</p>
        <div className="flex gap-1.5" aria-label={pattern.map((s) => (s === "clap" ? "clap" : "rest")).join(", ")}>
          {pattern.map((s, i) => (
            <span
              key={i}
              className={`flex h-9 w-12 items-center justify-center rounded-lg border text-xs font-extrabold ${i === cue.slot ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {s === "clap" ? "CLAP" : "rest"}
            </span>
          ))}
        </div>
      </>
    );
  }
  if (cue.kind === "say") {
    const o = OPPOSITE[cue.word]!;
    return (
      <>
        <p className="text-xs font-semibold text-muted-foreground">Coach says · di</p>
        <p className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-none text-primary">{cue.word}</p>
        <p className="mt-1 text-sm font-bold">Kids do: {o.opposite} <span className="text-xs font-semibold text-muted-foreground">({o.oppositeEs})</span></p>
      </>
    );
  }
  return null;
}
