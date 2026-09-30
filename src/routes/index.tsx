import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Pause, PictureInPicture2, Play, RotateCcw, Users, X, Check } from "lucide-react";
import { ZoomImport } from "@/components/ZoomImport";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fair Turns — Equitable speaking turns for live classes" },
      {
        name: "description",
        content:
          "Fair Turns picks a random student each turn so nobody speaks twice until everyone has spoken once. Built for live online English classes.",
      },
      { property: "og:title", content: "Fair Turns — Equitable speaking turns for live classes" },
      {
        property: "og:description",
        content:
          "Random turn picker with rounds, a big timer and a live roster, so every student participates exactly once per round.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FairTurns,
});

type Student = {
  id: string;
  name: string;
  total: number;
  roundsCompleted: number;
  doneThisRound: boolean;
};

type Screen = "setup" | "class" | "summary";

type RoundBanner = {
  round: number;
  message: string;
  exiting: boolean;
};

const PLACEHOLDER =
  "Dalia\nEstuardo\nTanya\nArleth\nKaterin\nEduardo\nWalter\nKeily\nMishelle\nJason\nAngela";

const COACH_MESSAGES = [
  "You are an awesome coach!",
  "You can do it, coach!",
  "You got this!",
  "You are destined for great things!",
  "You are a fantastic coach!",
  "Your persistence is paying off!",
  "This is an Excellent Plus class!",
  "Every student spoke. That's great teaching!",
  "Your class is on fire today!",
  "Keep going, champion coach!",
] as const;

function shuffleMessages(messages: readonly string[], avoidFirst?: string) {
  const shuffled = [...messages];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    const replacement = shuffled[j];
    if (current !== undefined && replacement !== undefined) {
      shuffled[i] = replacement;
      shuffled[j] = current;
    }
  }
  if (avoidFirst && shuffled[0] === avoidFirst && shuffled.length > 1) {
    const first = shuffled[0];
    const second = shuffled[1];
    if (first !== undefined && second !== undefined) {
      shuffled[0] = second;
      shuffled[1] = first;
    }
  }
  return shuffled;
}

function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const name = line.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function mmss(total: number) {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.72);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio is a nice-to-have */
  }
}

function FairTurns() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [rosterText, setRosterText] = useState("");
  const [useTimer, setUseTimer] = useState(true);
  const [turnSeconds, setTurnSeconds] = useState(60);

  const [students, setStudents] = useState<Student[]>([]);
  const [round, setRound] = useState(1);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [banner, setBanner] = useState<RoundBanner | null>(null);

  const [remaining, setRemaining] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  const lastNextAt = useRef(Number.NEGATIVE_INFINITY);
  const messageQueue = useRef<string[]>([]);
  const lastCoachMessage = useRef<string | undefined>(undefined);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [compact, setCompact] = useState(false);
  const [lastPicked, setLastPicked] = useState<Student | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [newName, setNewName] = useState("");

  const parsed = useMemo(() => parseNames(rosterText), [rosterText]);
  const pending = useMemo(() => students.filter((s) => !s.doneThisRound), [students]);
  const doneCount = students.length - pending.length;
  const current = students.find((s) => s.id === currentId) ?? (currentId ? lastPicked : null);

  // ---- timer ----
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          setTimerRunning(false);
          setTimeUp(true);
          playBeep();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const startClass = () => {
    setStudents(
      parsed.map((name) => ({
        id: makeId(),
        name,
        total: 0,
        roundsCompleted: 0,
        doneThisRound: false,
      })),
    );
    setRound(1);
    setCurrentId(null);
    setBanner(null);
    messageQueue.current = [COACH_MESSAGES[0], ...shuffleMessages(COACH_MESSAGES.slice(1))];
    lastCoachMessage.current = undefined;
    setRemaining(turnSeconds);
    setTimerRunning(false);
    setTimeUp(false);
    setScreen("class");
  };

  const commitPick = useCallback(
    (picked: Student, startsNewRound = false) => {
      setCurrentId(picked.id);
      setLastPicked({ ...picked, total: picked.total + 1 });
      setStudents((prev) => {
        const next = prev.map((s) => {
          const base = startsNewRound ? { ...s, doneThisRound: false } : s;
          return s.id === picked.id
            ? { ...base, doneThisRound: true, total: s.total + 1, roundsCompleted: s.roundsCompleted + 1 }
            : base;
        });
        return next;
      });
      if (useTimer) {
        setRemaining(turnSeconds);
        setTimeUp(false);
        setTimerRunning(true);
      }
    },
    [turnSeconds, useTimer],
  );

  useEffect(() => {
    if (screen !== "class" || banner || students.length === 0) return;
    if (!students.every((s) => s.doneThisRound)) return;
    if (messageQueue.current.length === 0) {
      messageQueue.current = shuffleMessages(COACH_MESSAGES, lastCoachMessage.current);
    }
    const message = messageQueue.current.shift() ?? COACH_MESSAGES[0];
    lastCoachMessage.current = message;
    setBanner({ round, message, exiting: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, screen]);

  useEffect(() => {
    if (!banner) return;
    const delay = banner.exiting ? 300 : 2650;
    const t = window.setTimeout(() => {
      if (!banner.exiting) {
        setBanner((currentBanner) => currentBanner ? { ...currentBanner, exiting: true } : null);
        return;
      }
      setStudents((cur) => cur.map((s) => ({ ...s, doneThisRound: false })));
      setRound((r) => r + 1);
      setBanner(null);
    }, delay);
    return () => window.clearTimeout(t);
  }, [banner]);

  const addStudent = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    setNewName("");
    setStudents((prev) =>
      prev.some((s) => s.name.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, { id: makeId(), name, total: 0, roundsCompleted: 0, doneThisRound: false }],
    );
  };

  const removeStudent = (id: string) => setStudents((prev) => prev.filter((s) => s.id !== id));

  const addImported = (names: string[]) => {
    setRosterText((t) => parseNames([t, ...names].join("\n")).join("\n"));
  };

  const handleNext = useCallback(() => {
    const now = performance.now();
    if (now - lastNextAt.current < 300) return;
    const startsNewRound = !!banner;
    const pool = startsNewRound ? students : students.filter((s) => !s.doneThisRound);
    if (pool.length === 0) return;
    lastNextAt.current = now;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) return;
    if (startsNewRound) {
      setBanner(null);
      setRound((r) => r + 1);
    }
    commitPick(picked, startsNewRound);
  }, [banner, commitPick, students]);

  const toggleTimer = useCallback(() => {
    if (!useTimer) return;
    setTimerRunning((r) => {
      if (!r && remaining === 0) {
        setRemaining(turnSeconds);
        setTimeUp(false);
      }
      return !r;
    });
  }, [remaining, turnSeconds, useTimer]);

  useEffect(() => {
    if (screen !== "class") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleNext();
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        toggleTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    pipWin?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pipWin?.removeEventListener("keydown", onKey);
    };
  }, [handleNext, screen, toggleTimer, pipWin]);

  // ---- float (Document Picture-in-Picture) ----
  useEffect(() => {
    setPipSupported(typeof window !== "undefined" && "documentPictureInPicture" in window);
  }, []);

  useEffect(() => {
    if (screen !== "class" && pipWin) pipWin.close();
  }, [screen, pipWin]);

  const openFloat = async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (!dpip) return;
    const w = await dpip.requestWindow({ width: 320, height: 320 });
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      w.document.head.appendChild(node.cloneNode(true));
    });
    w.document.documentElement.className = document.documentElement.className;
    w.document.body.style.margin = "0";
    w.document.body.style.height = "100vh";
    w.document.body.style.display = "flex";
    w.addEventListener("pagehide", () => setPipWin(null));
    setPipWin(w);
  };

  const editRoster = () => {
    setRosterText(students.map((s) => s.name).join("\n"));
    setTimerRunning(false);
    setScreen("setup");
  };

  const applyRosterEdits = () => {
    const names = parsed;
    setStudents((prev) => {
      const byName = new Map(prev.map((s) => [s.name.toLowerCase(), s]));
      return names.map((name) => {
        const existing = byName.get(name.toLowerCase());
        return existing
          ? { ...existing, name }
          : { id: makeId(), name, total: 0, roundsCompleted: 0, doneThisRound: false };
      });
    });
    setCurrentId(null);
    setScreen("class");
  };

  const resetAll = () => {
    setStudents([]);
    setRosterText("");
    setRound(1);
    setCurrentId(null);
    setScreen("setup");
  };

  // ---------------- setup ----------------
  if (screen === "setup") {
    const editing = students.length > 0;
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-5 py-12">
        <header className="space-y-3">
          <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-foreground">
            Fair participation
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tight">
            Fair Turns
          </h1>
          <p className="text-lg text-muted-foreground">
            Nobody participates twice until everyone has participated once.
          </p>
        </header>

        <section className="soft-card space-y-6 p-6 sm:p-8">
          <div className="space-y-2">
            <label htmlFor="roster" className="text-sm font-semibold">
              Paste or type student names, one per line
            </label>
            <ZoomImport onAdd={addImported} />
            <textarea
              id="roster"
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={10}
              className="w-full resize-y rounded-2xl border border-input bg-background p-4 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-sm text-muted-foreground">
              {parsed.length} student{parsed.length === 1 ? "" : "s"} detected. Blank lines and
              duplicates are ignored.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={useTimer}
                onChange={(e) => setUseTimer(e.target.checked)}
                className="size-5 accent-[var(--color-primary)]"
              />
              Use timer
            </label>
            <div className="space-y-1">
              <label htmlFor="secs" className="block text-sm font-semibold">
                Turn timer (seconds)
              </label>
              <input
                id="secs"
                type="number"
                min={15}
                max={300}
                value={turnSeconds}
                disabled={!useTimer}
                onChange={(e) =>
                  setTurnSeconds(Math.min(300, Math.max(15, Number(e.target.value) || 60)))
                }
                className="w-32 rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-14 rounded-2xl px-8 text-lg font-bold"
              disabled={parsed.length < 2}
              onClick={editing ? applyRosterEdits : startClass}
            >
              {editing ? "Save roster" : "Start class"}
            </Button>
            {editing && (
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-2xl px-6 text-lg"
                onClick={() => setScreen("class")}
              >
                Cancel
              </Button>
            )}
          </div>
        </section>
      </main>
    );
  }

  // ---------------- summary ----------------
  if (screen === "summary") {
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
    const totals = students.map((s) => s.total);
    const diff = totals.length ? Math.max(...totals) - Math.min(...totals) : 0;
    const summaryText = [
      "Fair Turns — class summary",
      ...sorted.map((s) => `${s.name}: ${s.total} participations, ${s.roundsCompleted} rounds`),
      `Max difference between any two students: ${diff}`,
    ].join("\n");

    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-5 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight">
          Class summary
        </h1>
        <section className="soft-card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary text-sm uppercase tracking-wide text-secondary-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Student</th>
                <th className="px-5 py-3 font-semibold">Participations</th>
                <th className="px-5 py-3 font-semibold">Rounds completed</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-5 py-3 text-lg font-semibold">{s.name}</td>
                  <td className="px-5 py-3 text-lg">{s.total}</td>
                  <td className="px-5 py-3 text-lg">{s.roundsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-lg font-semibold">
          Max difference between any two students:{" "}
          <span className={diff <= 1 ? "text-primary" : "text-destructive"}>{diff}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" className="h-14 rounded-2xl px-8 text-lg font-bold" onClick={resetAll}>
            Start new class
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 rounded-2xl px-6 text-lg"
            onClick={() => void navigator.clipboard?.writeText(summaryText)}
          >
            Copy summary
          </Button>
        </div>
      </main>
    );
  }

  // ---------------- class ----------------
  const progress = students.length ? (doneCount / students.length) * 100 : 0;
  const timeRatio = turnSeconds ? remaining / turnSeconds : 0;
  const timeColor =
    remaining === 0 ? "text-destructive" : timeRatio <= 0.25 ? "text-warning" : "text-foreground";
  const barColor =
    remaining === 0 ? "bg-destructive" : timeRatio <= 0.25 ? "bg-warning" : "bg-primary";

  const resetTimer = () => {
    setRemaining(turnSeconds);
    setTimeUp(false);
    setTimerRunning(false);
  };

  const rosterPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") addStudent();
          }}
          placeholder="New student"
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button size="sm" className="rounded-lg" onClick={addStudent}>Add</Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {students.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg bg-secondary px-2 py-1 text-sm font-semibold text-secondary-foreground">
            <span className="flex-1 truncate">{s.name}</span>
            {s.doneThisRound && <Check className="h-4 w-4 text-primary" aria-label="Participated" />}
            <button onClick={() => removeStudent(s.id)} aria-label={`Remove ${s.name}`} className="rounded p-0.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const mini = (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-between gap-2 bg-background p-3 text-foreground">
      <div className="flex justify-end">
        <button
          onClick={() => setShowRoster((v) => !v)}
          className="z-10 flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground"
          aria-label="Roster"
        >
          <Users className="h-3.5 w-3.5" /> {students.length}
        </button>
      </div>
      {banner && (
        <div className={`truncate rounded-lg bg-primary px-2 py-1 text-center text-xs font-bold text-primary-foreground ${banner.exiting ? "animate-banner-out" : "animate-banner-in"}`}>
          {banner.message}
        </div>
      )}
      <p
        key={current ? current.id + String(current.total) : "empty"}
        className="animate-pop-in truncate text-center font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight text-primary"
      >
        {current?.name ?? "—"}
      </p>
      {showRoster && rosterPanel}
      {useTimer && (
        <div className="space-y-1">
          <p className={`text-center text-2xl font-extrabold tabular-nums ${timeColor}`}>
            {remaining === 0 && timeUp ? "Time's up" : mmss(remaining)}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
              style={{ width: `${Math.max(0, timeRatio * 100)}%` }}
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleNext}
          disabled={!banner && pending.length === 0}
          className="h-12 flex-1 rounded-2xl text-xl font-extrabold tracking-wide"
        >
          NEXT
        </Button>
        {useTimer && (
          <>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={toggleTimer} aria-label={timerRunning ? "Pause" : "Resume"}>
              {timerRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={resetTimer} aria-label="Reset">
              <RotateCcw className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
      <p className="text-center text-xs font-semibold text-muted-foreground">
        Round {round} · {doneCount}/{students.length}
      </p>
    </div>
  );

  const pipPortal = pipWin ? createPortal(mini, pipWin.document.body) : null;

  if (compact && !pipSupported) {
    return (
      <main className="flex min-h-screen flex-col">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={() => setCompact(false)}>
            <Maximize2 className="mr-1 h-4 w-4" /> Full view
          </Button>
        </div>
        <div className="flex-1">{mini}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6">
      {pipPortal}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">
            Fair Turns
          </h1>
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">
            Round {round}
          </span>
        </div>
        <div className="flex gap-2">
          {pipSupported ? (
            !pipWin && (
              <Button className="rounded-xl" onClick={() => void openFloat()}>
                <PictureInPicture2 className="mr-1 h-4 w-4" /> Float
              </Button>
            )
          ) : (
            <Button
              variant="outline"
              className="rounded-xl"
              title="For a floating window, open this app in Chrome or Edge."
              onClick={() => setCompact(true)}
            >
              <Minimize2 className="mr-1 h-4 w-4" /> Compact mode
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={editRoster}>
            Edit roster
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              setTimerRunning(false);
              setScreen("summary");
            }}
          >
            End class
          </Button>
        </div>
      </header>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-muted-foreground">
          <span>
            {doneCount} / {students.length} participated
          </span>
          <span>{pending.length} pending this round</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {banner && (
        <div className="relative isolate">
          <div className="confetti-burst" aria-hidden>
            {Array.from({ length: 20 }, (_, index) => <span key={index} />)}
          </div>
          <div className={`relative z-10 rounded-2xl bg-primary px-6 py-4 text-center text-primary-foreground ${banner.exiting ? "animate-banner-out" : "animate-banner-in"}`}>
            <p className="text-2xl font-extrabold">Round {banner.round} complete 🎉</p>
            <p className="mt-1 text-base font-semibold">{banner.message}</p>
          </div>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="stage-card flex min-h-[22rem] flex-col items-center justify-center gap-6 p-8 text-center">
          {current ? (
            <p
              key={current.id + String(current.total)}
              className="animate-pop-in font-[family-name:var(--font-display)] text-6xl font-extrabold leading-tight text-primary sm:text-8xl"
            >
              {current.name}
            </p>
          ) : (
            <p className="text-2xl font-semibold text-muted-foreground">
              Press NEXT to pick the first student
            </p>
          )}

          <Button
            onClick={handleNext}
            disabled={!banner && pending.length === 0}
            className="h-24 w-full max-w-md rounded-3xl text-4xl font-extrabold tracking-wide"
          >
            NEXT
          </Button>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Space = next · P = pause / resume
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {useTimer && (
            <div className="soft-card space-y-4 p-6 text-center">
              <p className={`font-[family-name:var(--font-display)] text-7xl font-extrabold tabular-nums ${timeColor}`}>
                {mmss(remaining)}
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
                  style={{ width: `${Math.max(0, timeRatio * 100)}%` }}
                />
              </div>
              {timeUp && <p className="text-lg font-bold text-destructive">Time's up</p>}
              <div className="flex justify-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={toggleTimer}>
                  {timerRunning ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setRemaining(turnSeconds);
                    setTimeUp(false);
                    setTimerRunning(false);
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}

          <div className="soft-card space-y-3 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Roster
            </h2>
            <ul className="flex flex-wrap gap-2">
              {students.map((s) => {
                const isCurrent = s.id === currentId;
                const cls = isCurrent
                  ? "bg-primary text-primary-foreground"
                  : s.doneThisRound
                    ? "bg-muted text-muted-foreground"
                    : "bg-secondary text-secondary-foreground";
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-base font-semibold transition-colors ${cls}`}
                  >
                    {s.doneThisRound && !isCurrent && <span aria-hidden>✓</span>}
                    <span>{s.name}</span>
                    <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-bold text-foreground">
                      ×{s.total}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
