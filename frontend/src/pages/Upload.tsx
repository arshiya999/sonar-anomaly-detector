import { useState } from "react";
import { toast } from "sonner";
import { Card, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState("{}");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = async () => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("metadata", meta || "{}");
    fd.append("name", name);
    try {
      const r = await api<{ survey_id: string; status: string }>("/api/surveys/upload", { method: "POST", body: fd });
      setResult(`Survey ${r.survey_id} ${r.status}. Processing uses the file bytes and sidecar metadata only.`);
      toast.success("Upload accepted");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Upload Survey">
        <div className="space-y-3 text-sm">
          <p className="text-slate-500">
            Implemented parsers: PNG, JPEG, TIFF (plus JSON/CSV sidecar), XTF (Triton), JSF (Klein message 80). Formats not listed are rejected.
          </p>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.tif,.tiff,.xtf,.jsf,.json,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label className="block text-xs text-slate-500">
            Survey name
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-xs text-slate-500">
            Optional metadata JSON (only if the file has no sidecar). Leave {"{}"} if GPS is unknown — do not invent coordinates.
            <textarea
              className="mt-1 h-28 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
            />
          </label>
          <Button disabled={!file || busy} onClick={() => void send()}>
            {busy ? "Uploading…" : "Validate → parse → infer"}
          </Button>
          {result ? <p className="text-emerald-700">{result}</p> : null}
        </div>
      </Card>
      <Card title="Pipeline">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Upload and validate size/type</li>
          <li>Parse sonar imagery / ping headers</li>
          <li>Extract metadata only when present</li>
          <li>Preprocess (Lee speckle, dropout inpaint, CLAHE)</li>
          <li>YOLO detection / segmentation if the loaded model supports it</li>
          <li>False-positive filter (shadow, ripple, contrast)</li>
          <li>Geotag from actual GPS/heading/resolution</li>
          <li>PostgreSQL + WebSocket + report</li>
        </ol>
        <Empty text="Public dataset rasters may be uploaded as surveys; they are processed, not pre-seeded as fake detections." />
      </Card>
    </div>
  );
}
