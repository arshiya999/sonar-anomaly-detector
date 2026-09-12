/** Match ml/infer.py present_confidence. Used so older log rows (25–60%) remap on the map. */
export function presentConfidencePct(fusedPct: number): number {
  if (!Number.isFinite(fusedPct)) return fusedPct;
  if (fusedPct >= 72 && fusedPct <= 93) return fusedPct;
  const x = Math.min(1, Math.max(0, fusedPct / 100));
  let y: number;
  if (x < 0.45) y = 0.72 + ((x - 0.18) / 0.27) * 0.06;
  else if (x < 0.70) y = 0.78 + ((x - 0.45) / 0.25) * 0.08;
  else y = 0.86 + ((x - 0.70) / 0.30) * 0.06;
  return Math.round(Math.min(92, Math.max(72, y * 100)) * 10) / 10;
}
