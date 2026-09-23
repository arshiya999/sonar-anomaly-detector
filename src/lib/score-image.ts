import { CLASS_LABEL } from "@/lib/labels";

/** Known sample labels from public/samples/manifest.json */
export const SAMPLE_CLASS: Record<string, string> = {
  "sctd_000238.jpg": "shipwreck",
  "sctd_000086.jpg": "aircraft",
  "sctd_000100.jpg": "diver",
  "wt_marine-debris-aris3k-237.png": "propeller",
  "wt_marine-debris-aris3k-1597.png": "debris",
  "wt_marine-debris-aris3k-262.png": "cylinder",
  "wt_marine-debris-aris3k-530.png": "ghost_net",
  "wt_marine-debris-aris3k-645.png": "tire",
};

const NAME_HINTS: [RegExp, string][] = [
  [/aircraft|aero|plane/i, "aircraft"],
  [/shipwreck|wreck/i, "shipwreck"],
  [/propeller|\bprop\b/i, "propeller"],
  [/ghost[_\s-]?net|\bnet\b|trawl/i, "ghost_net"],
  [/tire|tyre/i, "tire"],
  [/diver|swimmer|human/i, "diver"],
  [/cylinder|pipe/i, "cylinder"],
  [/debris|litter/i, "debris"],
];

export type Verdict = "correct" | "incorrect";

export function basename(filename: string): string {
  return (filename.split(/[/\\]/).pop() ?? filename).trim();
}

export function expectedClass(filename: string): string | null {
  const name = basename(filename);
  const fromSample = SAMPLE_CLASS[name] ?? SAMPLE_CLASS[name.toLowerCase()];
  if (fromSample) return fromSample;
  for (const [re, cls] of NAME_HINTS) {
    if (re.test(name)) return cls;
  }
  return null;
}

export function topClass(
  detections: { class: string; confidence: number }[],
): string | null {
  if (!detections.length) return null;
  return [...detections].sort((a, b) => b.confidence - a.confidence)[0].class;
}

/**
 * Correct = predicted class matches a known label (sample name or filename).
 * If there is no label: Correct = at least one contact boxed; Incorrect = none.
 */
export function scoreVerdict(
  filename: string,
  detections: { class: string; confidence: number }[],
): { expected: string | null; predicted: string | null; verdict: Verdict; labelled: boolean } {
  const expected = expectedClass(filename);
  const predicted = topClass(detections);
  if (expected) {
    const hit = detections.some((d) => d.class === expected);
    return { expected, predicted, verdict: hit ? "correct" : "incorrect", labelled: true };
  }
  return {
    expected,
    predicted,
    verdict: detections.length > 0 ? "correct" : "incorrect",
    labelled: false,
  };
}

export function classTitle(id: string | null): string {
  if (!id) return "—";
  return CLASS_LABEL[id] ?? id;
}
