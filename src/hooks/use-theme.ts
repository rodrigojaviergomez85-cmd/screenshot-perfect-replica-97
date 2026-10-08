import { useCallback, useEffect, useState } from "react";
import { applyThemeDocument, resolveTheme, saveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

export function useTheme() {
  const [state, setState] = useState<{ theme: Theme; ready: boolean; warning: boolean }>({ theme: "light", ready: false, warning: false });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Remain usable when storage is blocked. */ }
    let explicit = saved === "light" || saved === "dark";
    const theme = resolveTheme(saved, media.matches);
    applyThemeDocument(document, theme);
    setState({ theme, ready: true, warning: false });
    const onSystemChange = () => {
      if (explicit) return;
      const next = resolveTheme(null, media.matches);
      applyThemeDocument(document, next);
      setState((s) => ({ ...s, theme: next }));
    };
    const onChoice = () => { explicit = true; };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("fair-turns-theme-choice", onChoice);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("fair-turns-theme-choice", onChoice);
    };
  }, []);

  const toggle = useCallback(() => {
    if (!state.ready) return;
    const theme: Theme = state.theme === "dark" ? "light" : "dark";
    applyThemeDocument(document, theme);
    window.dispatchEvent(new Event("fair-turns-theme-choice"));
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* saveTheme reports failure. */ }
    setState({ theme, ready: true, warning: !saveTheme(storage, theme) });
  }, [state.ready, state.theme]);
  return { ...state, toggle };
}