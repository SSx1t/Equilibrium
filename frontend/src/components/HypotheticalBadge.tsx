export function HypotheticalBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 font-medium text-amber-300 ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
      title="These figures include user-hypothetical edits (amenity overrides and/or population growth). They are NOT recorded data."
    >
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-400" />
      WHAT-IF
    </span>
  );
}
