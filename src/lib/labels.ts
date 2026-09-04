export const CLASS_LABEL: Record<string, string> = {
  ghost_net: "Ghost net / gear",
  debris: "Man-made debris",
  shipwreck: "Shipwreck",
  aircraft: "Aircraft wreck",
  propeller: "Propeller",
  tire: "Tire",
  cylinder: "Cylinder / pipe",
  diver: "Diver / human",
};

export const CLASS_COLOR: Record<string, string> = {
  ghost_net: "#38bdf8",
  debris: "#5eead4",
  shipwreck: "#f87171",
  aircraft: "#c4b5fd",
  propeller: "#fbbf24",
  tire: "#34d399",
  cylinder: "#facc15",
  diver: "#fb7185",
};

export function confidenceBand(confidence: number): "low" | "medium" | "high" {
  if (confidence > 80) return "high";
  if (confidence >= 50) return "medium";
  return "low";
}

export function confidenceColor(confidence: number): string {
  const band = confidenceBand(confidence);
  if (band === "high") return "#ef4444";
  if (band === "medium") return "#f97316";
  return "#22c55e";
}
