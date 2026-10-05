export const THEME_STORAGE_KEY = "fair-turns-theme";

export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_OPTIONS.includes(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemIsDark ? "dark" : "light") : preference;
}