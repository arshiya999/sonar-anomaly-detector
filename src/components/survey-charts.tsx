"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  PieChart as PieIcon,
  ScrollText,
  Shield,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import { formatIst } from "@/lib/format";
import type { ScanLogEntry } from "@/lib/types";
import { Toggle } from "@/components/ui/toggle";
import { ClassMixPie } from "@/components/class-mix-pie";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GraphId = "mix" | "timeline" | "confidence" | "speed" | "risk";

const GRAPHS: { id: GraphId; label: string; hint: string; icon: typeof BarChart3 }[] = [
  { id: "mix", label: "Pie chart", hint: "Colour mix of debris classes", icon: PieIcon },
  { id: "timeline", label: "Intake", hint: "Images entered over time", icon: Activity },
  { id: "confidence", label: "Confidence", hint: "How sure the model was", icon: Gauge },
  { id: "speed", label: "Latency", hint: "Milliseconds per image", icon: Clock3 },
  { id: "risk", label: "Hazard", hint: "Cleanup priority scores", icon: Shield },
];

const OCEAN_TOOLTIP = {
  background: "#0c4a6e",
  border: "1px solid #22d3ee",
  borderRadius: 10,
  fontSize: 12,
  color: "#ecfeff",
};

const OCEAN_TICK = { fill: "#bae6fd", fontSize: 11 };
const OCEAN_GRID = "#155e75";

const CONF_BAR: Record<string, string> = {
  "0-25%": "#155e75",
  "25-50%": "#0e7490",
  "50-75%": "#22d3ee",
  "75-100%": "#fbbf24",
};

export function SurveyCharts({
  entries,
  defaultGraphs = ["mix", "timeline", "confidence"],
  showLogTable = true,
}: {
  entries: ScanLogEntry[];
  defaultGraphs?: GraphId[];
  showLogTable?: boolean;
}) {
  const [on, setOn] = useState<GraphId[]>(defaultGraphs);
  const [showLog, setShowLog] = useState(showLogTable);
  const stats = useMemo(() => buildStats(entries), [entries]);

  const toggle = (id: GraphId) => {
    setOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Insight k="Images logged" v={String(stats.scans)} d="Running total of sonar files" />
        <Insight k="Detections" v={String(stats.hits)} d="Anomalies found (also called hazards)" />
        <Insight
          k="Top class"
          v={stats.topClass ? CLASS_LABEL[stats.topClass] ?? stats.topClass : "—"}
          d={stats.topClass ? `${stats.byClass[stats.topClass]} detections` : "Run Analyze to fill this chart"}
        />
        <Insight
          k="Mean confidence"
          v={stats.hits ? `${stats.meanConf.toFixed(0)}%` : "—"}
          d={stats.scans ? `${stats.meanMs.toFixed(0)} ms average` : "Awaiting images"}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">Toggle graphs</p>
          <p className="text-xs text-muted-foreground">
            Show only the views you need. Charts update as new sonar images are entered.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GRAPHS.map((g) => {
            const Icon = g.icon;
            const active = on.includes(g.id);
            return (
              <Toggle
                key={g.id}
                pressed={active}
                onPressedChange={() => toggle(g.id)}
                variant="outline"
                size="sm"
                className={
                  active
                    ? "border-primary/50 bg-primary/15 text-foreground data-[state=on]:bg-primary/20"
                    : ""
                }
                title={g.hint}
              >
                <Icon />
                {g.label}
              </Toggle>
            );
          })}
        </div>
      </div>

      {on.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          All graphs are hidden. Toggle one above to bring a chart back.
        </p>
      ) : (
        <div className={`grid gap-4 ${on.length === 1 ? "grid-cols-1" : "xl:grid-cols-2"}`}>
          {on.includes("mix") && (
            <ChartCard
              title="Debris pie chart"
              subtitle={
                stats.classRows.length
                  ? "Each slice is a detected class across all uploaded images"
                  : "Upload sonar files — slices appear for each class (pipe, wreck, debris, …)"
              }
            >
              <ClassMixPie rows={stats.classRows} height={280} />
            </ChartCard>
          )}
          {on.includes("timeline") && (
            <ChartCard
              tone="ocean"
              title="Images entered"
              subtitle="Cumulative count — the line should rise every time you upload a new file"
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.timeline} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="intakeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#0c4a6e" stopOpacity={0.15} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={OCEAN_GRID} />
                  <XAxis dataKey="label" tick={OCEAN_TICK} />
                  <YAxis allowDecimals={false} tick={OCEAN_TICK} />
                  <Tooltip contentStyle={OCEAN_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="images"
                    name="Images uploaded (total)"
                    stroke="#67e8f9"
                    fill="url(#intakeFill)"
                    strokeWidth={2.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="hits"
                    name="Detections (total)"
                    stroke="#fbbf24"
                    fill="transparent"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("confidence") && (
            <ChartCard
              tone="ocean"
              title="Fused confidence"
              subtitle="How many detections fall in each confidence band (updates with every scan)"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.confBuckets} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={OCEAN_GRID} />
                  <XAxis dataKey="label" tick={OCEAN_TICK} />
                  <YAxis allowDecimals={false} tick={OCEAN_TICK} />
                  <Tooltip contentStyle={OCEAN_TOOLTIP} />
                  <Bar dataKey="count" name="Detections" radius={[6, 6, 0, 0]}>
                    {stats.confBuckets.map((row) => (
                      <Cell key={row.label} fill={CONF_BAR[row.label] ?? "#22d3ee"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("speed") && (
            <ChartCard
              title="Onboard latency"
              subtitle="Edge-friendly YOLO11n — lower is better for AUV use"
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.speed} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="i" tick={{ fill: "#64748b", fontSize: 11 }} name="Scan" />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} unit=" ms" />
                  <Tooltip contentStyle={OCEAN_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="ms"
                    name="Inference ms"
                    stroke="#fbbf24"
                    fill="#fbbf24"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("risk") && (
            <ChartCard
              tone="ocean"
              title="Hazard score"
              subtitle="Ghost gear and wrecks rank higher for cleanup order"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.risk} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={OCEAN_GRID} />
                  <XAxis dataKey="label" tick={OCEAN_TICK} />
                  <YAxis tick={OCEAN_TICK} domain={[0, 100]} />
                  <Tooltip contentStyle={OCEAN_TOOLTIP} />
                  <Bar dataKey="score" name="Mean hazard" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {stats.risk.map((row) => (
                      <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#fb7185"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <ScrollText className="size-4 text-primary" />
          <div>
            <p className="font-medium">Intake log</p>
            <p className="text-xs text-muted-foreground">
              Timestamp, filename, hits, and latency for every image entered
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Show table
          <button
            type="button"
            role="switch"
            aria-checked={showLog}
            onClick={() => setShowLog((v) => !v)}
            className={`relative h-5 w-9 rounded-full transition ${showLog ? "bg-amber-400" : "bg-stone-600"}`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white transition ${showLog ? "left-4" : "left-0.5"}`}
            />
          </button>
        </label>
      </div>

      {showLog &&
        (entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log is empty until the first image is scanned.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (IST)</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Hits</TableHead>
                  <TableHead>ms</TableHead>
                  <TableHead>Top class</TableHead>
                  <TableHead>Survey</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 50).map((e) => {
                  const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">
                        {formatIst(e.at)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{e.filename}</TableCell>
                      <TableCell className="font-medium">{e.count}</TableCell>
                      <TableCell className="font-mono text-xs">{e.inference_ms}</TableCell>
                      <TableCell className="text-xs">
                        {top ? `${CLASS_LABEL[top.class] ?? top.class} ${top.confidence.toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{e.survey}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  );
}

function Insight({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 to-transparent px-4 py-3">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{k}</p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight">{v}</p>
      <p className="truncate text-xs text-muted-foreground">{d}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  tone = "light",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  tone?: "light" | "ocean";
}) {
  const ocean = tone === "ocean";
  return (
    <div
      className={
        ocean
          ? "overflow-hidden rounded-xl border border-cyan-600/80 bg-[#0c4a6e] p-4 text-cyan-50 shadow-inner"
          : "overflow-hidden rounded-xl border border-border/70 bg-card/60 p-4 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.04)]"
      }
    >
      <div className="mb-3 flex items-start gap-2">
        <BarChart3 className={`mt-0.5 size-4 ${ocean ? "text-cyan-300" : "text-primary"}`} />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className={`text-xs ${ocean ? "text-cyan-200" : "text-muted-foreground"}`}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function buildStats(entries: ScanLogEntry[]) {
  const byClass: Record<string, number> = {};
  const riskSum: Record<string, number> = {};
  const riskN: Record<string, number> = {};
  const buckets = [
    { key: "0-25", lo: 0, hi: 25, count: 0 },
    { key: "25-50", lo: 25, hi: 50, count: 0 },
    { key: "50-75", lo: 50, hi: 75, count: 0 },
    { key: "75-100", lo: 75, hi: 101, count: 0 },
  ];
  let confSum = 0;
  let hits = 0;
  let msSum = 0;
  const chronological = [...entries].sort(
    (a, b) => Date.parse(a.at || "") - Date.parse(b.at || "") || a.filename.localeCompare(b.filename),
  );
  const speed = chronological.map((e, i) => ({ i: i + 1, ms: e.inference_ms }));

  for (const e of entries) {
    msSum += e.inference_ms;
    for (const d of e.detections) {
      hits += 1;
      confSum += d.confidence;
      byClass[d.class] = (byClass[d.class] ?? 0) + 1;
      riskSum[d.class] = (riskSum[d.class] ?? 0) + d.hazard_score;
      riskN[d.class] = (riskN[d.class] ?? 0) + 1;
      const b = buckets.find((x) => d.confidence >= x.lo && d.confidence < x.hi);
      if (b) b.count += 1;
    }
  }

  const classRows = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .map(([cls, count]) => ({
      class: cls,
      label: CLASS_LABEL[cls] ?? cls,
      count,
    }));
  const topClass = classRows[0]?.class ?? "";
  let runningHits = 0;
  const timeline = chronological.map((e, i) => {
    runningHits += e.detections.length;
    const t = Date.parse(e.at);
    const label = Number.isFinite(t)
      ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
      : String(i + 1);
    return { label: `${i + 1} · ${label}`, images: i + 1, hits: runningHits };
  });
  const risk = Object.keys(riskN).map((cls) => ({
    class: cls,
    label: CLASS_LABEL[cls] ?? cls,
    score: Math.round(riskSum[cls] / riskN[cls]),
  }));

  return {
    scans: entries.length,
    hits,
    byClass,
    topClass,
    meanConf: hits ? confSum / hits : 0,
    meanMs: entries.length ? msSum / entries.length : 0,
    classRows,
    timeline,
    confBuckets: buckets.map((b) => ({ label: b.key + "%", count: b.count })),
    speed,
    risk,
  };
}
