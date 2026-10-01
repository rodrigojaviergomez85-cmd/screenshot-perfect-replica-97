import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, MoreVertical, Pencil, Maximize2, Minimize2, Pause, PictureInPicture2, Play, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import { ZoomImport } from "@/components/ZoomImport";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  /** Week key (Monday date) when the student did Automatic Fluency. */
  afWeek?: string | undefined;
  /** Local day the student was marked absent. */
  absentDay?: string | undefined;
};

type Screen = "home" | "setup" | "class" | "summary";

const CLASS_STORAGE_KEY = "fair-turns-class"; // legacy single-class key, migrated once
const CLASSES_STORAGE_KEY = "fair-turns-classes";

type SavedClass = { id: string; name: string; day: string; round: number; students: Student[]; updatedAt: number };

function normalizeStudents(raw: unknown): Student[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Student => !!s && typeof s.id === "string" && typeof s.name === "string")
    .map((s) => ({
      id: s.id, name: s.name, total: Number(s.total) || 0, roundsCompleted: Number(s.roundsCompleted) || 0,
      doneThisRound: !!s.doneThisRound, skippedThisRound: !!s.skippedThisRound,
      afWeek: typeof s.afWeek === "string" && s.afWeek === weekKey() ? s.afWeek : undefined,
      absentDay: typeof s.absentDay === "string" && s.absentDay === localDay() ? s.absentDay : undefined,
    }));
}

function normalizeClass(raw: unknown): SavedClass | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<SavedClass>;
  if (typeof c.id !== "string" || typeof c.name !== "string") return null;
  return {
    id: c.id, name: c.name.slice(0, 60), day: typeof c.day === "string" ? c.day : "",
    round: Number.isInteger(c.round) && (c.round ?? 0) > 0 ? c.round! : 1,
    students: normalizeStudents(c.students), updatedAt: Number(c.updatedAt) || 0,
  };
}

function localDay(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Calendar week key: local date of that week's Monday. */
function weekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

const AF_COUNT_KEY = "fair-turns-af-count";
const AF_SECONDS_KEY = "fair-turns-af-seconds";

function resetDay(list: Student[]): Student[] {
  return list.map((s) => ({ ...s, total: 0, roundsCompleted: 0, doneThisRound: false, skippedThisRound: false }));
}

function Tally({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const groups: number[] = [];
  for (let left = count; left > 0; left -= 5) groups.push(Math.min(5, left));
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} role="img" aria-label={`${count} participations today`}>
      {groups.map((n, gi) => (
        <svg key={gi} width={n === 5 ? 22 : 4 + (n - 1) * 5} height="16" viewBox={`0 0 ${n === 5 ? 22 : 4 + (n - 1) * 5} 16`} aria-hidden className="shrink-0">
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <line key={i} x1={2 + i * 5} y1="1" x2={2 + i * 5} y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ))}
          {n === 5 && <line x1="0" y1="13" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        </svg>
      ))}
    </span>
  );
}

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
const TIMER_STORAGE_KEY = "fair-turns-time";

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
      <Button
        type="button"
        size="sm"
        variant={value === 0 ? "default" : "outline"}
        className="h-6 min-w-10 rounded-md px-2 text-xs font-bold"
        onClick={() => onSelect(0)}
        title="No timer"
        aria-label="No timer"
      >
        ∞
      </Button>
    </div>
  );
}

function FairTurns() {
  const [screen, setScreen] = useState<Screen>("home");
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
  const [classDay, setClassDay] = useState(() => localDay());
  const [classes, setClasses] = useState<SavedClass[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  /** Class actually loaded into the live session; only this one is ever synced back to storage. */
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState("");
  const [setupMode, setSetupMode] = useState<"new" | "edit">("new");
  const [week, setWeek] = useState(() => weekKey());
  const [afMode, setAfMode] = useState(false);
  const [afCount, setAfCount] = useState<2 | 3>(2);
  const [afSeconds, setAfSeconds] = useState(120);
  const [afQueue, setAfQueue] = useState<string[]>([]);
  const [afIndex, setAfIndex] = useState(-1);
  const [afSkipped, setAfSkipped] = useState<string[]>([]);
  const afPrevWeek = useRef(new Map<string, string | undefined>());

  const lastNextAt = useRef(Number.NEGATIVE_INFINITY);
  const messageQueue = useRef<string[]>([]);
  const lastCoachMessage = useRef<string | undefined>(undefined);
  const undoMessageTimer = useRef<number | null>(null);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [compact, setCompact] = useState(false);
  const [lastPicked, setLastPicked] = useState<Student | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [miniView, setMiniView] = useState<"controls" | "tally">("controls");
  const [newName, setNewName] = useState("");
  const [closingMessage, setClosingMessage] = useState<string | null>(null);
  const [skipUndo, setSkipUndo] = useState<{
    students: Student[]; currentId: string | null; lastPicked: Student | null; remaining: number;
    activeTurnSeconds: number; timerRunning: boolean; timeUp: boolean; round: number; banner: RoundBanner | null;
    af?: { queue: string[]; index: number; skipped: string[] };
  } | null>(null);
  const skipUndoTimer = useRef<number | null>(null);
  const bannerShownForRound = useRef<number | null>(null);
  const clearSkipUndo = () => {
    if (skipUndoTimer.current !== null) window.clearTimeout(skipUndoTimer.current);
    skipUndoTimer.current = null;
    setSkipUndo(null);
  };

  const parsed = useMemo(() => parseNames(rosterText), [rosterText]);
  const isAbsent = (s: Student) => s.absentDay === classDay;
  const presentStudents = students.filter((s) => !isAbsent(s));
  const pending = presentStudents.filter((s) => !s.doneThisRound);
  const doneCount = presentStudents.length - pending.length;
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
      const savedTime = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (savedTime !== null) {
        const seconds = Number(savedTime);
        if (Number.isInteger(seconds) && (seconds === 0 || (seconds >= 5 && seconds <= 300))) {
          setTurnSeconds(seconds);
          setRemaining(seconds);
          setActiveTurnSeconds(seconds);
        }
      }
      const savedAfCount = window.localStorage.getItem(AF_COUNT_KEY);
      if (savedAfCount === "3") setAfCount(3);
      const savedAfSeconds = Number(window.localStorage.getItem(AF_SECONDS_KEY));
      if (Number.isInteger(savedAfSeconds) && savedAfSeconds >= 30 && savedAfSeconds <= 600) setAfSeconds(savedAfSeconds);
      const savedClasses = window.localStorage.getItem(CLASSES_STORAGE_KEY);
      let loaded: SavedClass[] = [];
      let lastId: string | null = null;
      if (savedClasses) {
        const data = JSON.parse(savedClasses) as { lastId?: unknown; classes?: unknown };
        loaded = Array.isArray(data.classes) ? data.classes.map(normalizeClass).filter((c): c is SavedClass => !!c) : [];
        lastId = typeof data.lastId === "string" ? data.lastId : null;
      }
      const legacy = window.localStorage.getItem(CLASS_STORAGE_KEY);
      if (legacy) {
        const data = JSON.parse(legacy) as { day?: string; round?: number; students?: unknown };
        const list = normalizeStudents(data.students);
        if (list.length > 0) {
          const id = makeId();
          loaded = [...loaded, { id, name: "My class", day: data.day ?? "", round: data.round ?? 1, students: list, updatedAt: Date.now() }];
          lastId = id;
        }
        window.localStorage.removeItem(CLASS_STORAGE_KEY);
      }
      setClasses(loaded);
      if (lastId && loaded.some((c) => c.id === lastId)) setActiveClassId(lastId);
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
      window.localStorage.setItem(TIMER_STORAGE_KEY, String(turnSeconds));
      window.localStorage.setItem(AF_COUNT_KEY, String(afCount));
      window.localStorage.setItem(AF_SECONDS_KEY, String(afSeconds));
    } catch {
      /* The app remains fully usable when browser storage is unavailable. */
    }
  }, [accentColor, coachMessages, preferencesLoaded, showCoachMessages, turnSeconds, afCount, afSeconds]);

  // Keep the active class entry in sync with live progress.
  useEffect(() => {
    if (!loadedClassId || screen === "home" || (screen === "setup" && setupMode === "new")) return;
    setClasses((prev) =>
      prev.map((c) => (c.id === loadedClassId ? { ...c, students, round, day: classDay, updatedAt: Date.now() } : c)),
    );
  }, [loadedClassId, classDay, round, screen, setupMode, students]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify({ lastId: activeClassId, classes }));
    } catch {
      /* Storage unavailable: classes still work for this session. */
    }
  }, [activeClassId, classes, preferencesLoaded]);

  // ---- day rollover (also when the tab stays open overnight) ----
  useEffect(() => {
    const check = () => {
      const thisWeek = weekKey();
      if (thisWeek !== week) {
        setWeek(thisWeek);
        setStudents((prev) => prev.map((s) => ({ ...s, afWeek: undefined })));
        setClasses((prev) => prev.map((c) => ({ ...c, students: c.students.map((s) => ({ ...s, afWeek: undefined })) })));
        setAfQueue([]); setAfIndex(-1); setAfSkipped([]);
      }
      const today = localDay();
      if (today === classDay) return;
      setClassDay(today);
      setStudents((prev) => resetDay(prev));
      setRound(1);
      setCurrentId(null);
      setLastPicked(null);
      setBanner(null);
      bannerShownForRound.current = null;
      setTimerRunning(false);
      setSkipUndo(null);
      setAfQueue([]); setAfIndex(-1); setAfSkipped([]);
    };
    const id = window.setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [classDay, week]);

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

  const enterClass = (list: Student[], classRound: number) => {
    clearSkipUndo();
    setStudents(list);
    setRound(classRound);
    setClassDay(localDay());
    setWeek(weekKey());
    setAfMode(false); setAfQueue([]); setAfIndex(-1); setAfSkipped([]);
    setCurrentId(null);
    setLastPicked(null);
    setBanner(null);
    bannerShownForRound.current = null;
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

  const startClass = () => {
    const id = makeId();
    const list = parsed.map((name) => ({ id: makeId(), name, total: 0, roundsCompleted: 0, doneThisRound: false }));
    const name = newClassName.trim().slice(0, 60) || `Class ${classes.length + 1}`;
    setClasses((prev) => [...prev, { id, name, day: localDay(), round: 1, students: list, updatedAt: Date.now() }]);
    setActiveClassId(id);
    setLoadedClassId(id);
    enterClass(list, 1);
  };

  const openClass = (c: SavedClass) => {
    const sameDay = c.day === localDay();
    setActiveClassId(c.id);
    setLoadedClassId(c.id);
    enterClass(normalizeStudents(sameDay ? c.students : resetDay(c.students)), sameDay ? c.round : 1);
  };

  const goHome = () => {
    setTimerRunning(false);
    clearSkipUndo();
    setBanner(null);
    setCurrentId(null);
    setLastPicked(null);
    pipWin?.close();
    setCompact(false);
    setLoadedClassId(null);
    setScreen("home");
  };

  const newClass = () => {
    setLoadedClassId(null);
    setTimerRunning(false);
    setSetupMode("new");
    setNewClassName("");
    setRosterText("");
    setScreen("setup");
  };

  const renameClass = (c: SavedClass) => {
    const name = window.prompt("Rename class", c.name)?.trim().slice(0, 60);
    if (!name) return;
    setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, name } : x)));
  };

  const deleteClass = (c: SavedClass) => {
    if (!window.confirm(`Delete "${c.name}"? This removes its students and today's tallies from this browser.`)) return;
    if (c.id === activeClassId) {
      setActiveClassId(null);
      setLoadedClassId(null);
      setStudents([]);
    }
    setClasses((prev) => prev.filter((x) => x.id !== c.id));
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
      if (useTimer && turnSeconds > 0) {
        setRemaining(turnSeconds);
        setActiveTurnSeconds(turnSeconds);
        setTimeUp(false);
        setTimerRunning(true);
      } else {
        setTimerRunning(false);
        setTimeUp(false);
      }
    },
    [turnSeconds, useTimer],
  );

  const roundComplete = presentStudents.length > 0 && presentStudents.every((s) => s.doneThisRound);

  // Show the round-complete banner once per completed round. The banner never changes round data.
  useEffect(() => {
    if (screen !== "class" || !roundComplete) return;
    if (bannerShownForRound.current === round) return;
    bannerShownForRound.current = round;
    if (showCoachMessages && messageQueue.current.length === 0 && activeMessages.length > 0) {
      messageQueue.current = shuffleMessages(activeMessages, lastCoachMessage.current);
    }
    const message = showCoachMessages ? (messageQueue.current.shift() ?? "") : "";
    if (message) lastCoachMessage.current = message;
    setBanner({ round, message, exiting: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundComplete, screen, round]);

  useEffect(() => {
    if (!banner) return;
    const delay = banner.exiting ? 300 : 2650;
    const t = window.setTimeout(() => {
      if (!banner.exiting) {
        setBanner((currentBanner) => currentBanner ? { ...currentBanner, exiting: true } : null);
        return;
      }
      setBanner(null);
    }, delay);
    return () => window.clearTimeout(t);
  }, [banner]);

  const addStudent = () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    setNewName("");
    if (students.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    clearSkipUndo();
    setStudents((prev) =>
      prev.some((s) => s.name.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, { id: makeId(), name, total: 0, roundsCompleted: 0, doneThisRound: false }],
    );
  };

  const removeStudent = (id: string) => {
    clearSkipUndo();
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const addImported = (names: string[]) => {
    setRosterText((t) => parseNames([t, ...names].join("\n")).join("\n"));
  };

  /** Shared pick rule for NEXT and Skip: no repeats in a round; first pick of a new round avoids the last picked. */
  const choosePick = (list: Student[], newRound: boolean, lastId: string | null): Student | null => {
    const present = list.filter((s) => s.absentDay !== classDay);
    let pool = newRound ? present : present.filter((s) => !s.doneThisRound);
    if (newRound && present.length >= 2 && lastId) {
      const filtered = pool.filter((s) => s.id !== lastId);
      if (filtered.length > 0) pool = filtered;
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  const startAfTimer = () => {
    setRemaining(afSeconds);
    setActiveTurnSeconds(afSeconds);
    setTimeUp(false);
    setTimerRunning(true);
  };

  const showAfPick = (list: Student[], id: string) => {
    const picked = list.find((s) => s.id === id);
    if (!picked) return;
    afPrevWeek.current.set(id, picked.afWeek);
    setCurrentId(id);
    setLastPicked({ ...picked, total: picked.total + 1, afWeek: week });
    setStudents(list.map((s) => (s.id === id ? { ...s, total: s.total + 1, afWeek: week } : s)));
    startAfTimer();
  };

  /** Rebuild the rest of an AF session: keep used ids, drop absent/removed, fill with eligible students (not-yet-AF first). */
  const planAf = (list: Student[], queue: string[], fromIndex: number): string[] => {
    const used = queue.slice(0, fromIndex);
    const valid = new Map(list.filter((s) => s.absentDay !== classDay).map((s) => [s.id, s]));
    const planned = queue.slice(fromIndex).filter((id) => valid.has(id) && !used.includes(id));
    const others = [...valid.values()].filter((s) => !used.includes(s.id) && !planned.includes(s.id));
    const fresh = (id: string) => valid.get(id)?.afWeek !== week;
    const pool = [
      ...planned.filter(fresh), ...shuffled(others.filter((s) => s.afWeek !== week)).map((s) => s.id),
      ...planned.filter((id) => !fresh(id)), ...shuffled(others.filter((s) => s.afWeek === week)).map((s) => s.id),
    ];
    return [...used, ...pool].slice(0, Math.max(afCount, used.length));
  };

  /** Automatic Fluency: weekly-fair picks (not-yet-AF first), no repeats within a session. */
  const afNext = () => {
    const now = performance.now();
    if (now - lastNextAt.current < 300) return;
    let index = afIndex + 1;
    let skipped = afSkipped;
    const inSession = afIndex >= 0 && index < afCount;
    let queue = inSession ? planAf(students, afQueue, index) : [];
    if (inSession && index >= queue.length) {
      // No distinct eligible candidate left in this session: end it cleanly, pick nobody.
      lastNextAt.current = now;
      clearSkipUndo();
      setAfQueue(queue); setAfIndex(afCount);
      setCurrentId(null);
      setTimerRunning(false);
      setTimeUp(false);
      return;
    }
    if (!inSession) {
      queue = planAf(students, [], 0);
      index = 0;
      skipped = [];
      if (queue.length === 0) return;
    }
    lastNextAt.current = now;
    clearSkipUndo();
    setAfQueue(queue); setAfIndex(index); setAfSkipped(skipped);
    showAfPick(students, queue[index]!);
  };

  const afSkip = () => {
    if (!current || afQueue[afIndex] !== current.id || afSkipped.includes(current.id)) return;
    const now = performance.now();
    if (now - lastNextAt.current < 300) return;
    lastNextAt.current = now;
    setSkipUndo({ students, currentId, lastPicked, remaining, activeTurnSeconds, timerRunning, timeUp, round, banner,
      af: { queue: afQueue, index: afIndex, skipped: afSkipped } });
    if (skipUndoTimer.current !== null) window.clearTimeout(skipUndoTimer.current);
    skipUndoTimer.current = window.setTimeout(() => { setSkipUndo(null); skipUndoTimer.current = null; }, 5000);
    const id = current.id;
    const next = students.map((s) =>
      s.id === id ? { ...s, total: Math.max(0, s.total - 1), afWeek: afPrevWeek.current.get(id) } : s,
    );
    setAfSkipped([...afSkipped, id]);
    const nextIndex = afIndex + 1;
    const queue = nextIndex < afCount ? planAf(next, afQueue, nextIndex) : afQueue.slice(0, nextIndex);
    setAfQueue(queue);
    setAfIndex(nextIndex < queue.length ? nextIndex : afCount);
    if (nextIndex < queue.length) {
      showAfPick(next, queue[nextIndex]!);
    } else {
      setStudents(next);
      setCurrentId(null);
      setTimerRunning(false);
      setTimeUp(false);
    }
  };

  const switchMode = (af: boolean) => {
    if (af === afMode) return;
    clearSkipUndo();
    setAfMode(af);
    setAfQueue([]); setAfIndex(-1); setAfSkipped([]);
    setCurrentId(null);
    setTimerRunning(false);
    setTimeUp(false);
    const seconds = af ? afSeconds : turnSeconds;
    setRemaining(seconds);
    setActiveTurnSeconds(seconds);
  };

  const toggleAbsent = (id: string) => {
    clearSkipUndo();
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, absentDay: s.absentDay === classDay ? undefined : classDay } : s)));
  };

  const handleNext = () => {
    if (afMode) { afNext(); return; }
    const now = performance.now();
    if (now - lastNextAt.current < 300) return;
    if (students.length === 0) return;
    const startsNewRound = presentStudents.every((s) => s.doneThisRound);
    const picked = choosePick(students, startsNewRound, lastPicked?.id ?? null);
    if (!picked) return;
    lastNextAt.current = now;
    clearSkipUndo();
    if (startsNewRound) {
      setBanner(null);
      setRound((r) => r + 1);
    }
    commitPick(picked, startsNewRound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

  const canSkip = afMode
    ? !!current && afQueue[afIndex] === current.id && !afSkipped.includes(current.id)
    : !!current && students.some((s) => s.id === current.id && !s.skippedThisRound);

  const handleSkip = () => {
    if (afMode) { afSkip(); return; }
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
    setStudents(next);
    // Skip completes the current round if nobody is left; the next round starts only on NEXT.
    const picked = choosePick(next, false, null);
    if (!picked) {
      setCurrentId(null);
      setTimerRunning(false);
      setTimeUp(false);
      return;
    }
    commitPick(picked, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  };

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
    if (skipUndo.af) {
      setAfQueue(skipUndo.af.queue); setAfIndex(skipUndo.af.index); setAfSkipped(skipUndo.af.skipped);
    }
    if (!skipUndo.students.every((s) => s.doneThisRound)) bannerShownForRound.current = null;
    clearSkipUndo();
  };

  const toggleTimer = useCallback(() => {
    if (!afMode && (!useTimer || turnSeconds === 0)) return;
    setTimerRunning((r) => {
      if (!r && remaining === 0) {
        setRemaining(activeTurnSeconds);
        setTimeUp(false);
      }
      return !r;
    });
  }, [activeTurnSeconds, afMode, remaining, turnSeconds, useTimer]);

  const applyTurnSeconds = useCallback(
    (seconds: number) => {
      const wasNoTimer = turnSeconds === 0;
      setTurnSeconds(seconds);
      setEditingTime(false);
      if (seconds === 0) {
        setTimerRunning(false);
        setTimeUp(false);
      } else if (wasNoTimer && current) {
        setRemaining(seconds);
        setActiveTurnSeconds(seconds);
        setTimeUp(false);
        setTimerRunning(true);
      }
    },
    [current, turnSeconds],
  );

  const cycleTurnSeconds = useCallback(() => {
    const cycle = [...TIMER_PRESETS, 0];
    const currentIndex = cycle.findIndex((seconds) => seconds === turnSeconds);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % cycle.length;
    applyTurnSeconds(cycle[nextIndex] ?? TIMER_PRESETS[0]);
  }, [applyTurnSeconds, turnSeconds]);

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
        if (!afMode) cycleTurnSeconds();
      }
    };
    window.addEventListener("keydown", onKey);
    pipWin?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      pipWin?.removeEventListener("keydown", onKey);
    };
  }, [afMode, cycleTurnSeconds, handleNext, handleSkip, screen, toggleTimer, pipWin]);

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
    setSetupMode("edit");
    setRosterText(students.map((s) => s.name).join("\n"));
    setTimerRunning(false);
    setScreen("setup");
  };

  const applyRosterEdits = () => {
    const names = parsed;
    clearSkipUndo();
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

  // ---------------- home ----------------
  if (screen === "home") {
    const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-5 py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold tracking-tight">Fair Turns</h1>
              <span className="size-3 rounded-full bg-primary" aria-label={`${accentColor} interface color`} />
            </div>
            <p className="text-lg text-muted-foreground">My classes</p>
          </div>
          <Button size="lg" className="h-12 rounded-2xl px-6 text-base font-bold" onClick={newClass}>
            <Plus className="mr-1 h-5 w-5" /> New class
          </Button>
        </header>
        {sortedClasses.length === 0 ? (
          <section className="soft-card space-y-4 p-8 text-center">
            <p className="text-lg text-muted-foreground">No classes yet. Create your first one to get started.</p>
            <Button size="lg" className="rounded-2xl" onClick={newClass}><Plus className="mr-1 h-5 w-5" /> New class</Button>
          </section>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {sortedClasses.map((c) => {
              const isLast = c.id === activeClassId;
              return (
                <li key={c.id} className={`soft-card relative flex items-stretch overflow-hidden ${isLast ? "ring-2 ring-primary" : ""}`}>
                  <button type="button" onClick={() => openClass(c)} className="flex flex-1 flex-col items-start gap-1 p-5 text-left hover:bg-muted/60">
                    {isLast && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">Last used</span>
                    )}
                    <span className="font-[family-name:var(--font-display)] text-xl font-extrabold">{c.name}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" /> {c.students.length} {c.students.length === 1 ? "student" : "students"}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="m-2 rounded-xl" aria-label={`Options for ${c.name}`}>
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => renameClass(c)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => deleteClass(c)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    );
  }

  // ---------------- setup ----------------
  if (screen === "setup") {
    const editing = setupMode === "edit";
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
          {!editing && (
            <div className="space-y-2">
              <label htmlFor="class-name" className="text-sm font-semibold">Class name</label>
              <input
                id="class-name"
                value={newClassName}
                maxLength={60}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="e.g. Monday 8am — Level 2"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
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
            {(editing || classes.length > 0) && (
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-2xl px-6 text-lg"
                onClick={() => setScreen(editing ? "class" : "home")}
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
                  <td className="px-5 py-3 text-lg"><Tally count={s.total} /></td>
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
          <Button size="lg" className="h-14 rounded-2xl px-8 text-lg font-bold" onClick={goHome}>
            Back to my classes
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
  const progress = presentStudents.length ? (doneCount / presentStudents.length) * 100 : 0;
  const noTimer = !afMode && turnSeconds === 0;
  const timeRatio = activeTurnSeconds ? remaining / activeTurnSeconds : 0;
  const timeColor =
    remaining === 0 ? "text-destructive" : timeRatio <= 0.25 ? "text-warning" : "text-accent-foreground";
  const barColor =
    remaining === 0 ? "bg-destructive" : timeRatio <= 0.25 ? "bg-warning" : "bg-primary";

  const resetTimer = () => {
    if (noTimer) return;
    const seconds = afMode ? afSeconds : turnSeconds;
    setRemaining(seconds);
    setActiveTurnSeconds(seconds);
    setTimeUp(false);
    setTimerRunning(true);
  };

  const selectTurnSeconds = (seconds: number) => {
    applyTurnSeconds(seconds);
  };

  const beginCustomTime = () => {
    setCustomDraft(String(customSeconds ?? turnSeconds));
    setEditingTime(true);
  };

  const confirmCustomTime = () => {
    const seconds = Math.min(300, Math.max(5, Math.round(Number(customDraft))));
    if (!Number.isFinite(seconds)) return;
    setCustomSeconds(seconds);
    applyTurnSeconds(seconds);
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

  const modeControls = (
    <div className="flex flex-wrap items-center justify-center gap-1 text-xs">
      <Button size="sm" variant={afMode ? "outline" : "default"} className="h-6 rounded-md px-2 text-xs font-bold" onClick={() => switchMode(false)}>Normal</Button>
      <Button size="sm" variant={afMode ? "default" : "outline"} className="h-6 rounded-md px-2 text-xs font-bold" onClick={() => switchMode(true)} title="Automatic Fluency">Automatic Fluency</Button>
      {afMode && (
        <>
          {([2, 3] as const).map((n) => (
            <Button key={n} size="sm" variant={afCount === n ? "default" : "outline"} className="h-6 min-w-8 rounded-md px-2 text-xs font-bold"
              onClick={() => { setAfCount(n); setAfQueue([]); setAfIndex(-1); setAfSkipped([]); }} aria-label={`${n} students`}>
              {n}
            </Button>
          ))}
          <label className="flex items-center gap-1 font-semibold text-muted-foreground">
            <input type="number" min={30} max={600} value={afSeconds}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) setAfSeconds(Math.min(600, Math.max(30, v)));
              }}
              className="h-6 w-14 rounded-md border border-input bg-background px-1 text-xs text-foreground" aria-label="Automatic Fluency seconds" />s
          </label>
        </>
      )}
    </div>
  );

  const afEnded = afMode && !current && afIndex >= afCount;
  const afProgress = afEnded ? "AF session ended · NEXT starts a new one" : afMode
    ? `AF ${Math.min(afIndex + 1, afQueue.length)}/${afQueue.length || afCount} · ${afSeconds}s`
    : null;

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
            <button onClick={() => toggleAbsent(s.id)} title={isAbsent(s) ? "Mark present today" : "Mark absent today"}
              className={`truncate text-left ${isAbsent(s) ? "line-through opacity-50" : ""}`}>{s.name}</button>
            {s.afWeek === week && <span className="text-[10px] font-bold text-primary">AF ✓</span>}
            <Tally count={s.total} className="flex-1 text-foreground/70" />
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

  const activeClassName = classes.find((c) => c.id === activeClassId)?.name ?? "Fair Turns";

  const tallyView = (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 bg-background p-2 text-foreground">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-lg px-2 text-xs font-bold" onClick={() => setMiniView("controls")}>
          <ChevronLeft className="h-4 w-4" /> Controls
        </Button>
        <p className="min-w-0 flex-1 truncate text-right text-sm font-extrabold">{activeClassName}</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1" aria-label="Tally marks today">
        {students.map((s) => {
          const absent = isAbsent(s);
          const isCur = s.id === currentId;
          return (
            <li key={s.id} className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isCur ? "bg-primary text-primary-foreground" : "bg-card"} ${absent ? "opacity-50" : ""}`}>
              <span className="flex min-w-0 items-center gap-1">
                <span className={`truncate font-bold ${absent ? "line-through" : ""}`} title={s.name}>{s.name}</span>
                {absent && <span className="shrink-0 text-[10px] font-semibold">absent</span>}
                {s.afWeek === week && <span className="shrink-0 text-[10px] font-bold">AF ✓</span>}
              </span>
              <span className="flex min-h-4 min-w-0">
                <Tally count={s.total} className="flex-wrap gap-y-1" />
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={handleNext} disabled={presentStudents.length === 0} className="h-9 flex-1 rounded-xl text-base font-extrabold">
          NEXT
        </Button>
        {!noTimer && (useTimer || afMode) && (
          <Button variant="outline" className="h-9 rounded-xl px-2 text-xs font-bold tabular-nums" onClick={toggleTimer} aria-label={timerRunning ? "Pause" : "Resume"}>
            {timerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {mmss(remaining)}
          </Button>
        )}
      </div>
    </div>
  );

  const mini = miniView === "tally" ? tallyView : (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-between gap-2 bg-background p-3 text-foreground">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" className="h-8 rounded-lg px-3 text-xs font-bold" onClick={() => setMiniView("tally")}>
          Tally marks
        </Button>
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
      {(useTimer || afMode) && (
        <div className="space-y-1">
          <div className={noTimer ? "invisible" : ""} aria-hidden={noTimer || undefined}>
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
          {!afMode && timerLengthControls}
        </div>
      )}
      {modeControls}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleNext}
          disabled={presentStudents.length === 0}
          className="h-12 flex-1 rounded-2xl text-xl font-extrabold tracking-wide"
        >
          NEXT
        </Button>
        <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl text-lg font-extrabold" onClick={handleSkip} disabled={!canSkip} title="Didn't participate" aria-label="Didn't participate">
          ✗
        </Button>
        {(useTimer || afMode) && (
          <>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" onClick={toggleTimer} disabled={noTimer} aria-label={timerRunning ? "Pause" : "Resume"}>
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
        {afProgress ?? `Round ${round} · ${doneCount}/${presentStudents.length} · ${noTimer ? "no timer" : `${turnSeconds}s`}`}
      </p>
    </div>
  );

  const pipPortal = pipWin ? createPortal(mini, pipWin.document.body) : null;

  if (compact && !pipSupported) {
    return (
      <main className="flex h-dvh flex-col overflow-hidden">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="sm" onClick={() => setCompact(false)}>
            <Maximize2 className="mr-1 h-4 w-4" /> Full view
          </Button>
        </div>
        <div className="min-h-0 flex-1">{mini}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6">
      {pipPortal}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">
              {classes.find((c) => c.id === activeClassId)?.name ?? "Fair Turns"}
            </h1>
            <span className="size-2.5 rounded-full bg-primary" aria-label={`${accentColor} interface color`} />
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">
            Round {round}
          </span>
        </div>
        <div className="col-span-full flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
          {pipSupported ? (
            !pipWin && (
              <Button
                className="h-20 min-w-[16rem] rounded-2xl px-6 text-left shadow-lg shadow-primary/30"
                onClick={() => void openFloat()}
              >
                <PictureInPicture2 className="mr-4 h-8 w-8 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                  <span className="text-lg font-bold whitespace-nowrap">Open floating window</span>
                  <span className="text-sm font-medium whitespace-nowrap opacity-90">Keep controls above Zoom</span>
                </span>
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
          <Button variant="outline" size="sm" className="rounded-xl" onClick={editRoster}>
            Edit roster
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              setTimerRunning(false);
              clearSkipUndo();
              const [next] = showCoachMessages
                ? shuffleMessages(activeMessages, lastCoachMessage.current)
                : [];
              setClosingMessage(next ?? null);
              setScreen("summary");
            }}
          >
            End class
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={goHome}>
            <ArrowLeft className="mr-1 h-4 w-4" /> My classes
          </Button>
        </div>
      </header>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-semibold text-muted-foreground">
          <span>
            {doneCount} / {presentStudents.length} participated
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
              disabled={presentStudents.length === 0}
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
          {!useTimer && !afMode && <div className="soft-card p-4">{modeControls}</div>}
          {(useTimer || afMode) && (
            <div className="soft-card space-y-4 p-6 text-center">
              <div className={noTimer ? "invisible" : ""} aria-hidden={noTimer || undefined}>
                <p className={`font-[family-name:var(--font-display)] text-7xl font-extrabold tabular-nums ${timeColor}`}>
                  {mmss(remaining)}
                </p>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
                    style={{ width: `${Math.max(0, timeRatio * 100)}%` }}
                  />
                </div>
              </div>
              {modeControls}
              {afProgress && <p className="text-sm font-bold text-primary">{afProgress}</p>}
              {!afMode && timerLengthControls}
              {!noTimer && timeUp && <p className="text-lg font-bold text-destructive">Time's up</p>}
              <div className="flex justify-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={toggleTimer} disabled={noTimer}>
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
                  : isAbsent(s)
                    ? "bg-muted text-muted-foreground line-through opacity-50"
                  : s.doneThisRound
                    ? "bg-muted text-muted-foreground"
                    : "bg-secondary text-secondary-foreground";
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-base font-semibold transition-colors ${cls}`}
                  >
                    {s.doneThisRound && !isCurrent && (s.skippedThisRound ? <span aria-label="Didn't participate" className="text-muted-foreground">✗</span> : <span aria-hidden>✓</span>)}
                    <button onClick={() => toggleAbsent(s.id)} title={isAbsent(s) ? "Absent today — tap to mark present" : "Tap to mark absent today"}>{s.name}</button>
                    {s.afWeek === week && <span className="text-xs font-bold">AF ✓</span>}
                    <Tally count={s.total} className={isCurrent ? "text-primary-foreground" : "text-foreground/70"} />
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
