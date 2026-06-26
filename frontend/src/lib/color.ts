// Gap score color scale: low gap (well served) -> teal/green,
// high gap (under-served) -> amber -> red. Tuned for a dark basemap.
const STOPS: { t: number; c: [number, number, number] }[] = [
  { t: 0, c: [34, 197, 94] }, // green-500
  { t: 0.35, c: [132, 204, 22] }, // lime-500
  { t: 0.55, c: [234, 179, 8] }, // yellow-500
  { t: 0.75, c: [249, 115, 22] }, // orange-500
  { t: 1, c: [239, 68, 68] }, // red-500
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function gapColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i].t) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const lt = (t - a.t) / (b.t - a.t);
      const r = Math.round(lerp(a.c[0], b.c[0], lt));
      const g = Math.round(lerp(a.c[1], b.c[1], lt));
      const bl = Math.round(lerp(a.c[2], b.c[2], lt));
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].c.join(",")})`;
}

export function gapLabel(score: number): string {
  if (score >= 85) return "Critical gap";
  if (score >= 65) return "High gap";
  if (score >= 45) return "Moderate gap";
  if (score >= 25) return "Low gap";
  return "Well served";
}
