import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Detection } from "@/lib/types";

export default function DetectionsPage() {
  const [rows, setRows] = useState<Detection[]>([]);
  const [sel, setSel] = useState<Detection | null>(null);
  const [cls, setCls] = useState("");
  const [risk, setRisk] = useState("");
  const [val, setVal] = useState("");

  const load = () => {
    const q = new URLSearchParams();
    if (cls) q.set("class_name", cls);
    if (risk) q.set("risk", risk);
    if (val) q.set("validation", val);
    api<Detection[]>(`/api/detections?${q.toString()}`).then(setRows);
  };

  useEffect(() => {
    load();
  }, [cls, risk, val]);

  const review = (decision: "approve" | "reject" | "uncertain") => {
    if (!sel) return;
    api(`/api/detections/${sel.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
      .then(() => {
        toast.success(`Stored ${decision}`);
        load();
      })
      .catch((e) => toast.error(String(e)));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card title="Detections">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input placeholder="class" value={cls} onChange={(e) => setCls(e.target.value)} className="w-32" />
          <Input placeholder="risk HIGH/MEDIUM/LOW" value={risk} onChange={(e) => setRisk(e.target.value)} className="w-40" />
          <Input placeholder="validation" value={val} onChange={(e) => setVal(e.target.value)} className="w-36" />
        </div>
        {rows.length === 0 ? (
          <Empty text="No detections available" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th>ID</th>
                  <th />
                  <th>Class</th>
                  <th>Final</th>
                  <th>Valid</th>
                  <th>Risk</th>
                  <th>GPS</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setSel(d)}>
                    <td className="py-2 font-mono">{d.id.slice(0, 8)}</td>
                    <td>{d.overlay_url ? <img src={d.overlay_url} alt="" className="size-10 rounded object-cover" /> : null}</td>
                    <td>{d.class_name}</td>
                    <td>{d.final_confidence.toFixed(0)}%</td>
                    <td>{d.validation_status}</td>
                    <td>{d.risk_level}</td>
                    <td>{d.gps_label}</td>
                    <td>{d.timestamp ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Detection details">
        {!sel ? (
          <Empty text="Select a detection" />
        ) : (
          <div className="space-y-2 text-xs">
            {sel.image_url ? <img src={sel.image_url} alt="crop context" className="rounded-lg" /> : null}
            {sel.overlay_url ? <img src={sel.overlay_url} alt="annotated" className="rounded-lg" /> : null}
            <p>ID {sel.id}</p>
            <p>Class {sel.class_name} (from loaded model)</p>
            <p>Raw {sel.raw_confidence}% · Final {sel.final_confidence}%</p>
            <p>Validation {sel.validation_status} · Risk {sel.risk_level}</p>
            <p>{sel.validation_reason}</p>
            <p>GPS {sel.gps_label}</p>
            <p>Depth {sel.depth ?? "Unavailable"} · Heading {sel.heading ?? "Unavailable"}</p>
            <p>Survey {sel.survey_id} · Frame {sel.frame_id} · Ping {sel.ping_number ?? "Unavailable"}</p>
            <p>Box {sel.width.toFixed(1)}×{sel.height.toFixed(1)} px · {sel.width_m ?? "—"} × {sel.length_m ?? "—"} m</p>
            <p>Operator {sel.operator_decision ?? "none"}</p>
            <div className="flex flex-wrap gap-1 pt-2">
              <Button size="sm" onClick={() => review("approve")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => review("uncertain")}>Mark Uncertain</Button>
              <Button size="sm" variant="destructive" onClick={() => review("reject")}>Reject</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
