import kit from "./kit-eval.json";

/** Held-out Ultralytics val — last row of ml/weights/results.csv (epoch 12, 126 images). */
const P = 0.81;
const R = 0.60355;

export const VAL_EVALUATION = {
  source: "Ultralytics val, YOLO11n, epoch 12, 126 held-out images (ml/weights/results.csv)",
  trainImages: 576,
  valImages: 126,
  epochs: 12,
  precision: P,
  recall: R,
  f1: (2 * P * R) / (P + R),
  map50: 0.74902,
  map50_95: 0.46277,
  classes: [
    "ghost_net",
    "debris",
    "shipwreck",
    "aircraft",
    "propeller",
    "tire",
    "cylinder",
    "diver",
  ] as const,
} as const;

export type ClassScore = {
  classId: string;
  support: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

export type KitEvaluation = {
  source: string;
  n: number;
  correct?: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy?: number;
  perClass: ClassScore[];
  confusion: number[][];
};

export const KIT_EVALUATION = kit as KitEvaluation;

export const EVAL_CLASSES = [...VAL_EVALUATION.classes];
