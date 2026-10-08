export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "fair-turns-theme";

export function resolveTheme(saved: string | null, prefersDark: boolean): Theme {
  return saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light";
}

export function saveTheme(storage: Pick<Storage, "setItem"> | null, theme: Theme): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch { return false; }
}

/** CSS is shared with PiP; root tokens inherit into its body and every view. */
export function applyThemeDocument(doc: Document, theme: Theme) {
  doc.documentElement.classList.toggle("dark", theme === "dark");
  doc.body.classList.toggle("dark", theme === "dark");
  doc.documentElement.style.colorScheme = theme;
}