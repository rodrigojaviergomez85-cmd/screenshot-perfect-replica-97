import { describe, expect, it, vi } from "vitest";
import { applyThemeDocument, resolveTheme, saveTheme, THEME_STORAGE_KEY } from "./theme";

describe("theme preference", () => {
  it("defaults to OS dark or light without a valid saved choice", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("invalid", true)).toBe("dark");
  });
  it("respects either saved choice instead of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("writes only the explicit theme key and handles blocked storage", () => {
    const setItem = vi.fn();
    expect(saveTheme({ setItem }, "dark")).toBe(true);
    expect(setItem.mock.calls).toEqual([[THEME_STORAGE_KEY, "dark"]]);
    expect(saveTheme(null, "light")).toBe(false);
    expect(saveTheme({ setItem: () => { throw Error("blocked"); } }, "light")).toBe(false);
  });
  it("applies and clears dark on both root and floating body without replacing other classes", () => {
    const rootToggle = vi.fn();
    const bodyToggle = vi.fn();
    const doc = { documentElement: { classList: { toggle: rootToggle }, style: {} }, body: { classList: { toggle: bodyToggle } } } as unknown as Document;
    applyThemeDocument(doc, "dark");
    applyThemeDocument(doc, "light");
    expect(rootToggle.mock.calls).toEqual([["dark", true], ["dark", false]]);
    expect(bodyToggle.mock.calls).toEqual(rootToggle.mock.calls);
    expect(doc.documentElement.style.colorScheme).toBe("light");
  });
});