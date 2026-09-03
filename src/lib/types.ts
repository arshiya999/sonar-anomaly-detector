export type Detection = {
  id: string;
  class: string;
  hazard_score: number;
  confidence: number;
  confidence_parts: { yolo: number; contrast: number; shadow: number };
  bbox_xyxy: number[];
  center_px: number[];
  latitude: number | null;
  longitude: number | null;
  dimensions: {
    width_m: number;
    length_m: number;
    width_px: number;
    height_px: number;
  };
};

export type DetectReport = {
  model: string;
  image_size: { width: number; height: number };
  inference_ms: number;
  threshold: number;
  detections: Detection[];
  count: number;
  metadata: Record<string, unknown>;
  survey_id: string;
};

export type DetectResponse = {
  report: DetectReport;
  overlay_jpeg_base64: string | null;
  error?: string;
};

export type SampleItem = {
  file: string;
  meta: string;
  example_class: string;
};

export type ScanLogEntry = {
  id: string;
  at: string;
  filename: string;
  survey: string;
  count: number;
  inference_ms: number;
  threshold: number;
  detections: Detection[];
};

