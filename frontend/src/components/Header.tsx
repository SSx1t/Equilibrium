"use client";

import { LogoLockup } from "./Logo";
import { useTheme } from "./ThemeProvider";

export type NavView = "analysis" | "simulations" | "reports" | "archives";
const NAV: NavView[] = ["analysis", "simulations", "reports", "archives"];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    </svg>
  );
}

export function Header({
  view,
  onNav,
  mode,
  onMode,
  onGenerateBriefing,
  briefingDisabled,
}: {
  view: NavView;
  onNav: (v: NavView) => void;
  mode: "planner" | "investor";
  onMode: (m: "planner" | "investor") => void;
  onGenerateBriefing: () => void;
  briefingDisabled: boolean;
}) {
  const { theme, toggle } = useTheme();
  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4 card-shadow">
      <div className="flex items-center gap-6">
        <LogoLockup />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onNav(v)}
              className={`relative rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                view === v
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {v}
              {view === v && (
                <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Planner / Investor mode pill */}
        <div className="hidden rounded-lg border border-border bg-panel-2 p-0.5 text-xs sm:flex">
          {(["planner", "investor"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onGenerateBriefing}
          disabled={briefingDisabled}
          className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SparkIcon /> Generate Briefing
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-panel-2 text-muted hover:text-foreground"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
