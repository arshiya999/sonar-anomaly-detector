import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOutletContext } from "react-router-dom";
import { Card } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import type { SystemStatus } from "@/lib/types";

type Settings = {
  conf_threshold: number;
  nms_threshold: number;
  lee_size: number;
  clahe_clip: number;
  use_lee: boolean;
  use_clahe: boolean;
  inpaint_dropouts: boolean;
  shadow_filter: boolean;
  model_path: string | null;
};

export default function SettingsPage() {
  const { status } = useOutletContext<{ status: SystemStatus | null }>();
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    api<Settings>("/api/settings").then(setS);
  }, []);

  if (!s) return <p className="text-sm text-slate-500">Loading settings from backend…</p>;

  const save = () =>
    api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    })
      .then(() => toast.success("Settings applied to subsequent inference"))
      .catch((e) => toast.error(String(e)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="AI model">
        <dl className="space-y-1 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd>{status?.model_info.name ?? "AI model not loaded"}</dd>
          <dt className="text-slate-500">Task</dt>
          <dd>{status?.model_info.task}</dd>
          <dt className="text-slate-500">Device</dt>
          <dd>{status?.model_info.device}</dd>
          <dt className="text-slate-500">Loaded classes</dt>
          <dd>{status?.model_info.classes.length ? status.model_info.classes.join(", ") : "none — weights missing"}</dd>
          <dt className="text-slate-500">MODEL_PATH</dt>
          <dd className="break-all font-mono text-xs">{status?.model_info.path}</dd>
        </dl>
        <label className="mt-3 block text-xs">
          Override model path
          <Input value={s.model_path ?? ""} onChange={(e) => setS({ ...s, model_path: e.target.value || null })} />
        </label>
      </Card>
      <Card title="Inference &amp; preprocessing">
        <p className="text-xs text-slate-500">Confidence {Math.round(s.conf_threshold * 100)}%</p>
        <Slider min={5} max={90} value={[s.conf_threshold * 100]} onValueChange={(v) => setS({ ...s, conf_threshold: Number(Array.isArray(v) ? v[0] : v) / 100 })} />
        <p className="mt-2 text-xs text-slate-500">NMS {s.nms_threshold}</p>
        <Slider min={10} max={90} value={[s.nms_threshold * 100]} onValueChange={(v) => setS({ ...s, nms_threshold: Number(Array.isArray(v) ? v[0] : v) / 100 })} />
        <label className="mt-3 flex items-center justify-between text-sm">
          <span>Lee speckle</span>
          <input type="checkbox" checked={s.use_lee} onChange={(e) => setS({ ...s, use_lee: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>CLAHE</span>
          <input type="checkbox" checked={s.use_clahe} onChange={(e) => setS({ ...s, use_clahe: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Dropout inpaint</span>
          <input type="checkbox" checked={s.inpaint_dropouts} onChange={(e) => setS({ ...s, inpaint_dropouts: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Acoustic-shadow filter</span>
          <input type="checkbox" checked={s.shadow_filter} onChange={(e) => setS({ ...s, shadow_filter: e.target.checked })} />
        </label>
        <Button className="mt-4" onClick={() => void save()}>Save</Button>
      </Card>
    </div>
  );
}
