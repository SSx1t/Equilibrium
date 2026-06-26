"use client";

/**
 * Equilibrium brand mark — a circle bisected by a horizontal line, with a teal
 * upper-right arc (an equilibrium / balance motif). Recreated as a crisp,
 * theme-aware SVG from the brand reference.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  const teal = "#0FB5A6";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* base circle */}
      <circle
        cx="50"
        cy="50"
        r="34"
        stroke="currentColor"
        strokeWidth="5"
        opacity="0.85"
      />
      {/* teal upper-right arc */}
      <path
        d="M50 16 A34 34 0 0 1 84 50"
        stroke={teal}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* bisecting bar extending beyond the circle */}
      <line
        x1="10"
        y1="50"
        x2="90"
        y2="50"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoLockup({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-foreground">
        <LogoMark size={compact ? 24 : 28} />
      </span>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">
          Equilibrium
          {!compact && <span className="text-muted font-normal"> Urban</span>}
        </div>
        {!compact && (
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-accent">
            AI PropTech
          </div>
        )}
      </div>
    </div>
  );
}
