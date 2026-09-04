import { useEffect, useState } from "react";
import { Card, Empty, fmt } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import type { Detection } from "@/lib/types";

export default function AnalysisPage() {
  const [dets, setDets] = useState<Detection[]>([]);
  const [sel, setSel] = useState<Detection | null>(null);
  const [shadow, setShadow] = useState(false);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    api<Detection[]>("/api/detections").then((r) => {
      setDets(r);
      setSel(r[0] ?? null);
    });
  }, []);

  const src = shadow ? sel?.shadow_url : sel?.overlay_url || sel?.image_url;
  const orig = sel?.image_url;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr_280px]">
      <Card title="Original sonar image">
        {orig ? (
          <img src={orig} alt="original" className="max-h-[480px] w-full object-contain" style={{ filter: `brightness(${bright / 100}) contrast(${contrast / 100})`, transform: `scale(${zoom / 100})` }} />
        ) : (
          <Empty text="No frames in the database" />
        )}
      </Card>
      <Card
        title="AI annotated"
        action={
          <Button size="sm" variant="outline" onClick={() => setShadow((v) => !v)}>
            {shadow ? "Hide Acoustic Shadow" : "Show Acoustic Shadow"}
          </Button>
        }
      >
        {src ? <img src={src} alt="annotated" className="max-h-[480px] w-full object-contain" /> : <Empty text="No annotated frame" />}
        <div className="mt-3 space-y-1 text-xs">
          <p>Zoom {zoom}%</p>
          <Slider min={50} max={180} value={[zoom]} onValueChange={(v) => setZoom(Number(Array.isArray(v) ? v[0] : v))} />
          <p>Brightness {bright}%</p>
          <Slider min={40} max={160} value={[bright]} onValueChange={(v) => setBright(Number(Array.isArray(v) ? v[0] : v))} />
          <p>Contrast {contrast}%</p>
          <Slider min={40} max={180} value={[contrast]} onValueChange={(v) => setContrast(Number(Array.isArray(v) ? v[0] : v))} />
        </div>
      </Card>
      <Card title="Detection information">
        {dets.length === 0 ? (
          <Empty text="No detections available" />
        ) : (
          <ul className="max-h-[520px] space-y-1 overflow-auto text-xs">
            {dets.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1.5 text-left ${sel?.id === d.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  onClick={() => setSel(d)}
                >
                  <span className="font-mono">{d.id.slice(0, 8)}</span> {d.class_name}
                  <br />
                  raw {d.raw_confidence.toFixed(0)}% · final {d.final_confidence.toFixed(0)}% · {d.validation_status} · {d.risk_level}
                  <br />
                  {d.gps_label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {sel ? (
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
            <p>Depth {fmt(sel.depth)} · heading {fmt(sel.heading)}</p>
            <p>Ping {fmt(sel.ping_number)} · frame {sel.frame_id.slice(0, 8)}</p>
            <p>Box {sel.width.toFixed(0)}×{sel.height.toFixed(0)} px · {fmt(sel.width_m)} × {fmt(sel.length_m)} m</p>
            <p className="text-slate-500">{sel.validation_reason}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
