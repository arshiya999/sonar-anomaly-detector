export const MODEL_METRICS = {
  map50: "74.9%",
  map5095: "46.3%",
  precision: "81.0%",
  recall: "60.4%",
  f1: "68.6%",
  trainImages: 576,
  valImages: 126,
  epochs: 12,
  model: "YOLO11n",
  params: "2.6M",
  imgsz: 320,
  device: "CPU / AUV-ready",
  datasets: ["SCTD 1.0", "Marine Debris FLS", "SeabedObjects-KLSG"],
  problem: "PS 26057",
  org: "MoES · NIOT",
} as const;

export const PIPELINE = [
  { id: "speckle", label: "Lee speckle" },
  { id: "clahe", label: "CLAHE restore" },
  { id: "yolo", label: "YOLO11n" },
  { id: "shadow", label: "Shadow fusion" },
  { id: "geo", label: "Geotag + report" },
] as const;
