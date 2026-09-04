import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DetectionMap } from "@/components/DetectionMap";
import { Card, Empty } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Detection, SurveyRow, SystemStatus } from "@/lib/types";

const COLORS = ["#2563eb", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#64748b"];

export default function DashboardPage() {
  const { status } = useOutletContext<{ status: SystemStatus | null }>();
  const [stats, setStats] = useState<{
    total: number;
    by_class: { class: string; count: number }[];
    confidence: { low: number; medium: number; high: number };
    latest: Detection | null;
  } | null>(null);
  const [mapPts, setMapPts] = useState<Detection[]>([]);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [dets, setDets] = useState<Detection[]>([]);

  useEffect(() => {
    const load = () => {
      api<typeof stats>("/api/detections/stats").then(setStats).catch(() => undefined);
      api<Detection[]>("/api/detections/map").then(setMapPts).catch(() => undefined);
      api<SurveyRow[]>("/api/surveys").then(setSurveys).catch(() => undefined);
      api<Detection[]>("/api/detections").then((r) => setDets(r.slice(0, 5))).catch(() => undefined);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const band = stats?.confidence ?? { low: 0, medium: 0, high: 0 };
  const bandT = Math.max(1, band.low + band.medium + band.high);
  const modelReady = status?.model === "loaded";

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        REAL SIDE-SCAN SONAR → PREPROCESS → AI DETECT/SEGMENT → FALSE-POSITIVE FILTER → CONFIDENCE → METADATA/GPS → MAP → JSON/CSV
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric t="System Status" v={status?.system === "processing" ? "Processing" : status?.system === "error" ? "Error" : "Ready"} c={status?.system === "ready" ? "g" : status?.system === "processing" ? "o" : "r"} />
        <Metric t="Sonar Status" v={status?.sonar === "connected" ? "Connected" : "Disconnected"} c={status?.sonar === "connected" ? "g" : "r"} />
        <Metric t="AI Model" v={modelReady ? "Loaded" : "Not Loaded"} d={status?.model_info.name ?? undefined} c={modelReady ? "p" : "r"} />
        <Metric t="Total Detections" v={String(status?.total_detections ?? 0)} c="b" />
        <Metric t="High Confidence Alerts" v={String(status?.high_confidence_alerts ?? 0)} c="r" />
        <Metric t="Current Survey" v={status?.current_survey?.name ?? "None"} c="o" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.9fr]">
        <Card title="Global / Live Detection Map">
          <div className="relative h-[340px] overflow-hidden rounded-lg">
            {mapPts.length === 0 ? (
              <Empty text="No geotagged detections. GPS unavailable or no surveys processed." />
            ) : (
              <DetectionMap
                points={mapPts.map((p) => ({
                  id: p.id,
                  latitude: p.latitude as number,
                  longitude: p.longitude as number,
                  class_name: p.class_name,
                  final_confidence: p.final_confidence,
                  timestamp: p.timestamp,
                  survey_id: p.survey_id,
                }))}
              />
            )}
          </div>
        </Card>
        <Card title="Detection Statistics">
          {!stats || stats.by_class.length === 0 ? (
            <Empty text="No detections available" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={stats.by_class} dataKey="count" nameKey="class" innerRadius={50} outerRadius={80}>
                  {stats.by_class.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 space-y-2 text-xs">
            <Bar l="High (>80%)" n={band.high} c="#ef4444" s={band.high / bandT} />
            <Bar l="Medium (50–80%)" n={band.medium} c="#f97316" s={band.medium / bandT} />
            <Bar l="Low (<50%)" n={band.low} c="#22c55e" s={band.low / bandT} />
          </div>
        </Card>
        <Card title="Latest Detection" action={<Link className="text-xs text-blue-600" to="/detections">View details</Link>}>
          {!stats?.latest ? (
            <Empty text="No detections available" />
          ) : (
            <Latest d={stats.latest} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Recent Survey Activity" action={<Link className="text-xs text-blue-600" to="/history">History</Link>}>
          {surveys.length === 0 ? (
            <Empty text="No surveys in the database" />
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1">Survey</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Frames</th>
                  <th>Detections</th>
                </tr>
              </thead>
              <tbody>
                {surveys.slice(0, 6).map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="truncate max-w-[140px]">{s.source_name}</td>
                    <td>{s.status}</td>
                    <td>{s.frames}</td>
                    <td>{s.detections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Recent Detections" action={<Link className="text-xs text-blue-600" to="/detections">All</Link>}>
          {dets.length === 0 ? (
            <Empty text="No detections available" />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {dets.map((d) => (
                <Link key={d.id} to="/analysis" className="overflow-hidden rounded-lg border border-slate-200">
                  {d.overlay_url ? <img src={d.overlay_url} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-slate-100" />}
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-semibold">{d.class_name}</p>
                    <p className="text-[10px] text-slate-500">{d.final_confidence.toFixed(0)}% · {d.gps_label}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Latest({ d }: { d: Detection }) {
  return (
    <div className="space-y-2 text-xs">
      {d.overlay_url ? <img src={d.overlay_url} alt="" className="h-36 w-full rounded-lg object-cover" /> : null}
      <p><span className="text-slate-500">Class</span> {d.class_name}</p>
      <p><span className="text-slate-500">Raw / Final</span> {d.raw_confidence.toFixed(0)}% / {d.final_confidence.toFixed(0)}%</p>
      <p><span className="text-slate-500">Status</span> {d.validation_status} · {d.risk_level}</p>
      <p><span className="text-slate-500">GPS</span> {d.gps_label}</p>
    </div>
  );
}

function Metric({ t, v, d, c }: { t: string; v: string; d?: string; c: "g" | "r" | "b" | "o" | "p" }) {
  const tone = { g: "bg-emerald-50 text-emerald-700", r: "bg-red-50 text-red-700", b: "bg-blue-50 text-blue-700", o: "bg-orange-50 text-orange-700", p: "bg-violet-50 text-violet-700" }[c];
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
      <p className="text-[11px] font-medium text-slate-500 uppercase">{t}</p>
      <p className="mt-1 truncate text-xl font-semibold">{v}</p>
      {d ? <p className="truncate text-[11px] text-slate-500">{d}</p> : null}
      <div className={`mt-2 inline-block rounded-md px-2 py-0.5 text-[10px] ${tone}`}>{c === "p" ? "YOLO" : t.split(" ")[0]}</div>
    </div>
  );
}

function Bar({ l, n, c, s }: { l: string; n: number; c: string; s: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between"><span>{l}</span><span>{n}</span></div>
      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.round(s * 100)}%`, background: c }} /></div>
    </div>
  );
}
