import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/theme";

export function ThemeToggle({ theme, ready, warning, toggle }: { theme: Theme; ready: boolean; warning: boolean; toggle: () => void }) {
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <div className="flex shrink-0 items-center gap-2">
      {warning && <span role="status" className="max-w-40 text-xs text-destructive">Theme changed, but could not be saved.</span>}
      <Button type="button" variant="outline" size="icon" onClick={toggle} disabled={!ready} aria-label={label} aria-pressed={theme === "dark"} title={label} className="theme-toggle shrink-0 rounded-xl">
        {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </div>
  );
}