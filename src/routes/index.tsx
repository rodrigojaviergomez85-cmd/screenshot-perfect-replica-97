import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Maximize2, Minimize2, Pause, PictureInPicture2, Play, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
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
  skippedThisRound?: boolean;
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

const TIMER_PRESETS = [10, 15, 30, 60] as const;
const ACCENT_OPTIONS = [
  { id: "red", label: "Red", swatch: "bg-swatch-red" },
  { id: "orange", label: "Orange", swatch: "bg-swatch-orange" },
  { id: "yellow", label: "Yellow", swatch: "bg-swatch-yellow" },
  { id: "green", label: "Green", swatch: "bg-swatch-green" },
  { id: "blue", label: "Blue", swatch: "bg-swatch-blue" },
  { id: "purple", label: "Purple", swatch: "bg-swatch-purple" },
] as const;
type AccentColor = (typeof ACCENT_OPTIONS)[number]["id"];

const COLOR_STORAGE_KEY = "fair-turns-accent";
const MESSAGES_STORAGE_KEY = "fair-turns-messages";
const SHOW_MESSAGES_STORAGE_KEY = "fair-turns-show-messages";

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

type TimerLengthControlsProps = {
  value: number;
  customValue: number | null;
  editing: boolean;
  draft: string;
  onSelect: (seconds: number) => void;
  onEdit: () => void;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

function TimerLengthControls({
  value,
  customValue,
  editing,
  draft,
  onSelect,
  onEdit,
  onDraftChange,
  onConfirm,
  onCancel,
}: TimerLengthControlsProps) {
  return (
    <div className="flex min-h-6 flex-wrap items-center justify-center gap-1" aria-label="Turn length">
      {TIMER_PRESETS.map((seconds) => (
        <Button
          key={seconds}
          type="button"
          size="sm"
          variant={value === seconds ? "default" : "outline"}
          className="h-6 min-w-10 rounded-md px-2 text-xs font-bold"
          onClick={() => onSelect(seconds)}
        >
          {seconds}s
        </Button>
      ))}
      {editing ? (
        <input
          autoFocus
          type="number"
          min={5}
          max={300}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onCancel}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
          aria-label="Custom turn length in seconds"
          className="h-6 w-14 rounded-md border border-input bg-background px-1 text-center text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant={customValue !== null && value === customValue ? "default" : "outline"}
          className="h-6 min-w-10 rounded-md px-2 text-xs font-bold"
          onClick={() => {
            if (customValue !== null && value !== customValue) {
              onSelect(customValue);
              return;
            }
            onEdit();
          }}
          aria-label={customValue === null ? "Set custom turn length" : "Use or edit custom turn length"}
          title={customValue === null ? "Custom time" : "Select once; tap again to edit"}
        >
          {customValue === null ? "✎" : `${customValue}s`}
        </Button>
      )}
    </div>
  );
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
  const [activeTurnSeconds, setActiveTurnSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [customSeconds, setCustomSeconds] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [accentColor, setAccentColor] = useState<AccentColor>("green");
  const [coachMessages, setCoachMessages] = useState<string[]>([...COACH_MESSAGES]);
  const [showCoachMessages, setShowCoachMessages] = useState(true);
  const [deletedCoachMessage, setDeletedCoachMessage] = useState<{ message: string; index: number } | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const lastNextAt = useRef(Number.NEGATIVE_INFINITY);
  const messageQueue = useRef<string[]>([]);
  const lastCoachMessage = useRef<string | undefined>(undefined);
  const undoMessageTimer = useRef<number | null>(null);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [compact, setCompact] = useState(false);
  const [lastPicked, setLastPicked] = useState<Student | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [newName, setNewName] = useState("");
  const [closingMessage, setClosingMessage] = useState<string | null>(null);
  const [skipUndo, setSkipUndo] = useState<{
    students: Student[]; currentId: string | null; lastPicked: Student | null; remaining: number;
    activeTurnSeconds: number; timerRunning: boolean; timeUp: boolean; round: number; banner: RoundBanner | null;
  } | null>(null);
  const skipUndoTimer = useRef<number | null>(null);

  const parsed = useMemo(() => parseNames(rosterText), [rosterText]);
  const pending = useMemo(() => students.filter((s) => !s.doneThisRound), [students]);
  const doneCount = students.length - pending.length;
  const current = students.find((s) => s.id === currentId) ?? (currentId ? lastPicked : null);
  const activeMessages = useMemo(() => {
    return coachMessages.map((message) => message.trim()).filter(Boolean);
  }, [coachMessages]);

  useEffect(() => {
    try {
      const savedColor = window.localStorage.getItem(COLOR_STORAGE_KEY);
      if (ACCENT_OPTIONS.some((option) => option.id === savedColor)) {
        setAccentColor(savedColor as AccentColor);
      }
      const savedMessages = window.localStorage.getItem(MESSAGES_STORAGE_KEY);
      if (savedMessages) {
        const parsedMessages: unknown = JSON.parse(savedMessages);
        if (Array.isArray(parsedMessages)) {
          setCoachMessages(
            parsedMessages
              .filter((message): message is string => typeof message === "string")
              .slice(0, 20)
              .map((message) => message.slice(0, 60)),
          );
        }
      }
      const savedShowMessages = window.localStorage.getItem(SHOW_MESSAGES_STORAGE_KEY);
      if (savedShowMessages !== null) setShowCoachMessages(savedShowMessages !== "false");
    } catch {
      /* Invalid or unavailable browser storage falls back to defaults. */
    }
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset["accent"] = accentColor;
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(COLOR_STORAGE_KEY, accentColor);
      window.localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(coachMessages));
      window.localStorage.setItem(SHOW_MESSAGES_STORAGE_KEY, String(showCoachMessages));
    } catch {
      /* The app remains fully usable when browser storage is unavailable. */
    }
  }, [accentColor, coachMessages, preferencesLoaded, showCoachMessages]);

  useEffect(() => () => {
    if (undoMessageTimer.current !== null) window.clearTimeout(undoMessageTimer.current);
  }, []);

  useEffect(() => {
    if (pipWin) pipWin.document.documentElement.dataset["accent"] = accentColor;
  }, [accentColor, pipWin]);

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
    const [firstMessage, ...laterMessages] = activeMessages;
    messageQueue.current = showCoachMessages && firstMessage
      ? [firstMessage, ...shuffleMessages(laterMessages)]
      : [];
    lastCoachMessage.current = undefined;
    setRemaining(turnSeconds);
    setActiveTurnSeconds(turnSeconds);
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
          const base = startsNewRound ? { ...s, doneThisRound: false, skippedThisRound: false } : s;
          return s.id === picked.id
            ? { ...base, doneThisRound: true, total: s.total + 1, roundsCompleted: s.roundsCompleted + 1 }
            : base;
        });
        return next;
      });
      if (useTimer) {
        setRemaining(turnSeconds);
        setActiveTurnSeconds(turnSeconds);
        setTimeUp(false);
        setTimerRunning(true);
      }
    },
    [turnSeconds, useTimer],
  );

  useEffect(() => {
    if (screen !== "class" || banner || students.length === 0) return;
    if (!students.every((s) => s.doneThisRound)) return;
    if (showCoachMessages && messageQueue.current.length === 0 && activeMessages.length > 0) {
      messageQueue.current = shuffleMessages(activeMessages, lastCoachMessage.current);
    }
    const message = showCoachMessages ? (messageQueue.current.shift() ?? "") : "";
    if (message) lastCoachMessage.current = message;
    setBanner({ round, message, exiting: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, screen, activeMessages, banner, round, showCoachMessages]);

  useEffect(() => {
    if (!banner) return;
    const delay = banner.exiting ? 300 : 2650;
    const t = window.setTimeout(() => {
      if (!banner.exiting) {
        setBanner((currentBanner) => currentBanner ? { ...currentBanner, exiting: true } : null);
        return;
      }
      setStudents((cur) => cur.map((s) => ({ ...s, doneThisRound: false, skippedThisRound: false })));
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
    let pool = startsNewRound ? students : students.filter((s) => !s.doneThisRound);
    if (startsNewRound && students.length >= 2 && lastPicked) {
      const filtered = pool.filter((s) => s.id !== lastPicked.id);
      if (filtered.length > 0) pool = filtered;
    }
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

  const canSkip = !!current && students.some((s) => s.id === current.id && !s.skippedThisRound);

  const handleSkip = useCallback(() => {
    if (!current) return;
    const target = students.find((s) => s.id === current.id);
    if (!target || target.skippedThisRound) return;
    const now = performance.now();
    if (now - lastNextAt.current < 300) return;
    lastNextAt.current = now;
    setSkipUndo({ students, currentId, lastPicked, remaining, activeTurnSeconds, timerRunning, timeUp, round, banner });
    if (skipUndoTimer.current !== null) window.clearTimeout(skipUndoTimer.current);
    skipUndoTimer.current = window.setTimeout(() => {
      setSkipUndo(null);
      skipUndoTimer.current = null;
    }, 5000);
    const counted = target.doneThisRound;
    const next = students.map((s) =>
      s.id === target.id
        ? {
            ...s,
            doneThisRound: true,
            skippedThisRound: true,
            total: counted ? Math.max(0, s.total - 1) : s.total,
            roundsCompleted: counted ? Math.max(0, s.roundsCompleted - 1) : s.roundsCompleted,
          }
        : s,
    );
    const startsNewRound = !!banner;
    let pool = startsNewRound ? next : next.filter((s) => !s.doneThisRound);
    if (startsNewRound && next.length >= 2 && lastPicked) {
      const filtered = pool.filter((s) => s.id !== lastPicked.id);
      if (filtered.length > 0) pool = filtered;
    }
    setStudents(next);
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) {
      setCurrentId(null);
      setTimerRunning(false);
      return;
    }
    if (startsNewRound) {
      setBanner(null);
      setRound((r) => r + 1);
    }
    commitPick(picked, startsNewRound);
  }, [activeTurnSeconds, banner, commitPick, current, currentId, lastPicked, remaining, round, students, timeUp, timerRunning]);

  const undoSkip = () => {
    if (!skipUndo) return;
    setStudents(skipUndo.students);
    setCurrentId(skipUndo.currentId);
    setLastPicked(skipUndo.lastPicked);
    setRemaining(skipUndo.remaining);
    setActiveTurnSeconds(skipUndo.activeTurnSeconds);
    setTimerRunning(skipUndo.timerRunning);
    setTimeUp(skipUndo.timeUp);
    setRound(skipUndo.round);
    setBanner(skipUndo.banner);
    setSkipUndo(null);
    if (skipUndoTimer.current !== null) window.clearTimeout(skipUndoTimer.current);
    skipUndoTimer.current = null;
  };

  const toggleTimer = useCallback(() => {
    if (!useTimer) return;
    setTimerRunning((r) => {
      if (!r && remaining === 0) {
        setRemaining(activeTurnSeconds);
        setTimeUp(false);
      }
      return !r;
    });
  }, [activeTurnSeconds, remaining, useTimer]);

  const cycleTurnSeconds = useCallback(() => {
    const currentIndex = TIMER_PRESETS.findIndex((seconds) => seconds === turnSeconds);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % TIMER_PRESETS.length;
    setTurnSeconds(TIMER_PRESETS[nextIndex] ?? TIMER_PRESETS[0]);
    setEditingTime(false);
  }, [turnSeconds]);

  useEffect(() => {
    if (screen !== "class") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleNext();
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleSkip();
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        toggleTimer();
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        cycleTurnSeconds();
      }
    };
    window.addEventListener("keydown", onKey);
    pipWin?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pipWin?.removeEventListener("keydown", onKey);
    };
  }, [cycleTurnSeconds, handleNext, handleSkip, screen, toggleTimer, pipWin]);

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
    try {
      const w = await dpip.requestWindow({ width: 320, height: 320 });
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        w.document.head.appendChild(node.cloneNode(true));
      });
      w.document.documentElement.className = document.documentElement.className;
      w.document.documentElement.dataset["accent"] = accentColor;
      w.document.body.style.margin = "0";
      w.document.body.style.height = "100vh";
      w.document.body.style.display = "flex";
      w.addEventListener("pagehide", () => setPipWin(null));
      setPipWin(w);
    } catch {
      setPipSupported(false);
      setCompact(true);
    }
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
    setClosingMessage(null);
    setScreen("setup");
  };

  const updateCoachMessage = (index: number, value: string) => {
    setCoachMessages((currentMessages) =>
      currentMessages.map((message, messageIndex) => messageIndex === index ? value.slice(0, 60) : message),
    );
  };

  const removeCoachMessage = (index: number) => {
    const message = coachMessages[index];
    if (message === undefined) return;
    setCoachMessages((currentMessages) => currentMessages.filter((_, messageIndex) => messageIndex !== index));
    setDeletedCoachMessage({ message, index });
    if (undoMessageTimer.current !== null) window.clearTimeout(undoMessageTimer.current);
    undoMessageTimer.current = window.setTimeout(() => {
      setDeletedCoachMessage(null);
      undoMessageTimer.current = null;
    }, 5000);
  };

  const undoRemoveCoachMessage = () => {
    if (!deletedCoachMessage) return;
    setCoachMessages((currentMessages) => {
      const restored = [...currentMessages];
      restored.splice(Math.min(deletedCoachMessage.index, restored.length), 0, deletedCoachMessage.message);
      return restored.slice(0, 20);
    });
    setDeletedCoachMessage(null);
    if (undoMessageTimer.current !== null) window.clearTimeout(undoMessageTimer.current);
    undoMessageTimer.current = null;
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
          <div className="flex items-center gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tight">
              Fair Turns
            </h1>
            <span className="size-3 rounded-full bg-primary" aria-label={`${accentColor} interface color`} />
          </div>
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

          <div className="border-t border-border pt-5">
            <Button
              type="button"
              variant="link"
              className="h-auto gap-2 p-0 text-sm font-bold text-foreground"
              aria-expanded={preferencesOpen}
              onClick={() => setPreferencesOpen((open) => !open)}
            >
              Preferences (color &amp; messages)
              <ChevronDown className={`h-4 w-4 transition-transform ${preferencesOpen ? "rotate-180" : ""}`} />
            </Button>

            {preferencesOpen && (
              <div className="mt-5 space-y-6">
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">Interface color</legend>
                  <div className="flex flex-wrap gap-3">
                    {ACCENT_OPTIONS.map((option) => (
                      <label key={option.id} className="flex cursor-pointer flex-col items-center gap-1.5 text-xs font-semibold">
                        <input
                          type="radio"
                          name="accent-color"
                          value={option.id}
                          checked={accentColor === option.id}
                          onChange={() => setAccentColor(option.id)}
                          className="sr-only"
                        />
                        <span className={`pointer-events-none flex size-9 items-center justify-center rounded-full border-2 ${option.swatch} ${accentColor === option.id ? "border-foreground" : "border-transparent"}`}>
                          {accentColor === option.id && <Check className="h-4 w-4 text-primary-foreground" />}
                        </span>
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Motivational messages</p>
                    <span className="text-xs text-muted-foreground">{coachMessages.length}/20</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={showCoachMessages}
                      onChange={(event) => setShowCoachMessages(event.target.checked)}
                      className="size-5 accent-[var(--color-primary)]"
                    />
                    Show motivational messages
                  </label>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {coachMessages.map((message, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={60}
                          value={message}
                          aria-label={`Motivational message ${index + 1}`}
                          onChange={(event) => updateCoachMessage(index, event.target.value)}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-lg text-destructive"
                          aria-label={`Delete message ${index + 1}`}
                          onClick={() => removeCoachMessage(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {coachMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground">No messages — add one or Reset to default</p>
                  )}
                  {deletedCoachMessage && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={undoRemoveCoachMessage}>
                      Undo
                    </Button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      disabled={coachMessages.length >= 20}
                      onClick={() => setCoachMessages((messages) => [...messages, ""])}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add message
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setCoachMessages([...COACH_MESSAGES])}
                    >
                      Reset to default
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
    const minTotal = totals.length ? Math.min(...totals) : 0;
    const allDone = students.length > 0 && students.every((s) => s.doneThisRound);
    const completedRounds = allDone ? round : Math.max(0, round - 1);
    const inProgress = !allDone && doneCount > 0;
    const statsLine = `${completedRounds} round${completedRounds === 1 ? "" : "s"} completed${
      inProgress ? " + 1 in progress" : ""
    } · ${students.length} student${students.length === 1 ? "" : "s"} · everyone spoke ${minTotal} ${
      minTotal === 1 ? "time" : "times"
    }.`;
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
        <section className="animate-banner-in rounded-2xl bg-primary px-6 py-5 text-center text-primary-foreground">
          <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold sm:text-4xl">
            Great class, coach!
          </p>
          <p className="mt-2 text-base font-semibold">{statsLine}</p>
          {closingMessage && <p className="mt-1 text-base font-semibold italic">{closingMessage}</p>}
        </section>
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
  const timeRatio = activeTurnSeconds ? remaining / activeTurnSeconds : 0;
  const timeColor =
    remaining === 0 ? "text-destructive" : timeRatio <= 0.25 ? "text-warning" : "text-accent-foreground";
  const barColor =
    remaining === 0 ? "bg-destructive" : timeRatio <= 0.25 ? "bg-warning" : "bg-primary";

  const resetTimer = () => {
    setRemaining(turnSeconds);
    setActiveTurnSeconds(turnSeconds);
    setTimeUp(false);
    setTimerRunning(true);
  };

  const selectTurnSeconds = (seconds: number) => {
    setTurnSeconds(seconds);
    setEditingTime(false);
  };

  const beginCustomTime = () => {
    setCustomDraft(String(customSeconds ?? turnSeconds));
    setEditingTime(true);
  };

  const confirmCustomTime = () => {
    const seconds = Math.min(300, Math.max(5, Math.round(Number(customDraft))));
    if (!Number.isFinite(seconds)) return;
    setCustomSeconds(seconds);
    setTurnSeconds(seconds);
    setEditingTime(false);
  };

  const timerLengthControls = (
    <TimerLengthControls
      value={turnSeconds}
      customValue={customSeconds}
      editing={editingTime}
      draft={customDraft}
      onSelect={selectTurnSeconds}
      onEdit={beginCustomTime}
      onDraftChange={setCustomDraft}
      onConfirm={confirmCustomTime}
      onCancel={() => setEditingTime(false)}
    />
  );

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
            {s.skippedThisRound ? (
              <span className="text-xs font-bold text-muted-foreground" aria-label="Didn't participate">✗</span>
            ) : s.doneThisRound && <Check className="h-4 w-4 text-primary" aria-label="Participated" />}
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
      {banner?.message && (
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
          {timerLengthControls}
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
        <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl text-lg font-extrabold" onClick={handleSkip} disabled={!canSkip} title="Didn't participate" aria-label="Didn't participate">
          ✗
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
      {skipUndo && (
        <button onClick={undoSkip} className="text-center text-xs font-bold text-primary underline">Undo skip</button>
      )}
      <p className="text-center text-xs font-semibold text-muted-foreground">
        Round {round} · {doneCount}/{students.length} · {turnSeconds}s
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
          <div className="flex items-center gap-2">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">
              Fair Turns
            </h1>
            <span className="size-2.5 rounded-full bg-primary" aria-label={`${accentColor} interface color`} />
          </div>
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
              const [next] = showCoachMessages
                ? shuffleMessages(activeMessages, lastCoachMessage.current)
                : [];
              setClosingMessage(next ?? null);
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
            {banner.message && <p className="mt-1 text-base font-semibold">{banner.message}</p>}
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

          <div className="flex w-full max-w-md items-center gap-3">
            <Button
              onClick={handleNext}
              disabled={!banner && pending.length === 0}
              className="h-24 flex-1 rounded-3xl text-4xl font-extrabold tracking-wide"
            >
              NEXT
            </Button>
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={!canSkip}
              title="Didn't participate"
              aria-label="Didn't participate"
              className="h-24 w-24 rounded-3xl text-4xl font-extrabold"
            >
              ✗
            </Button>
          </div>
          {skipUndo && (
            <button onClick={undoSkip} className="text-sm font-bold text-primary underline">Undo skip</button>
          )}
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Space = next · X = skip · P = pause · T = time
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
              {timerLengthControls}
              {timeUp && <p className="text-lg font-bold text-destructive">Time's up</p>}
              <div className="flex justify-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={toggleTimer}>
                  {timerRunning ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={resetTimer}
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
                    {s.doneThisRound && !isCurrent && (s.skippedThisRound ? <span aria-label="Didn't participate" className="text-muted-foreground">✗</span> : <span aria-hidden>✓</span>)}
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
