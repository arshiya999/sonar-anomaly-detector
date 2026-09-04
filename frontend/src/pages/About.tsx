import { Card } from "@/components/AppShell";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card title="Aqua Vision">
        <div className="space-y-2 text-sm text-slate-600">
          <p>Problem statement SIH26057 — AI-Powered Automated Underwater Marine Debris and Anomaly Detection System using Side-Scan Sonar Imagery.</p>
          <p>Ministry of Earth Sciences (MoES) · National Institute of Ocean Technology (NIOT).</p>
          <p>
            This console does not invent detections, GPS, or model accuracy. Empty states mean the corresponding real data has not entered the pipeline yet.
          </p>
        </div>
      </Card>
      <Card title="Pipeline">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Real side-scan sonar (live TCP/directory or file: PNG/JPEG/TIFF/XTF/JSF)</li>
          <li>Sonar image + ping metadata when present</li>
          <li>Preprocessing (speckle, dropouts, CLAHE) without deleting acoustic shadows</li>
          <li>YOLO detection / segmentation from loaded weights</li>
          <li>False-positive filtering and 0–100% fused confidence</li>
          <li>Geotag only from actual latitude/longitude</li>
          <li>PostgreSQL, live map, JSON/CSV reports, operator review</li>
        </ol>
      </Card>
    </div>
  );
}
