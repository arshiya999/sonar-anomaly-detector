"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  Play,
  Radar,
  Sparkles,
  Upload,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import { MODEL_METRICS } from "@/lib/metrics";
import type { DetectReport, DetectResponse, SampleItem, ScanLogEntry } from "@/lib/types";
import { SurveyCharts } from "@/components/survey-charts";
import { ClassMixPie } from "@/components/class-mix-pie";
import { PipelineStrip } from "@/components/pipeline-strip";
import { SonarTheater } from "@/components/sonar-theater";

const SonarMap = dynamic(
  () => import("@/components/sonar-map").then((m) => m.SonarMap),
  { ssr: false, loading: () => <div className="h-full animate-pulse bg-cyan-950/40" /> },
);

type MetaForm = {
  latitude: string;
  longitude: string;
  heading_deg: string;
  meters_per_pixel_x: string;
  meters_per_pixel_y: string;
  survey: string;
};

const DEFAULT_META: MetaForm = {
  latitude: "13.0827",
  longitude: "80.3708",
  heading_deg: "42",
  meters_per_pixel_x: "0.08",
  meters_per_pixel_y: "0.05",
  survey: "NIOT Bay of Bengal transect",
};

export function Dashboard({ initialSamples = [] }: { initialSamples?: SampleItem[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [report, setReport] = useState<DetectReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(22);
  const [samples, setSamples] = useState<SampleItem[]>(initialSamples);
  const [health, setHealth] = useState<{
    ok: boolean;
    trained?: boolean;
    weights?: string;
  } | null>(null);
  const [meta, setMeta] = useState<MetaForm>(DEFAULT_META);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [pipeStep, setPipeStep] = useState(0);
  const [clock, setClock] = useState("");

  const refreshLog = () =>
    fetch("/api/log", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.entries)) setLog(data.entries);
      })
      .catch(() => undefined);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!busy) {
      setPipeStep(report ? 4 : 0);
      return;
    }
    setPipeStep(0);
    const timers = [350, 800, 1400, 2100].map((ms, i) =>
      window.setTimeout(() => setPipeStep(i + 1), ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [busy, report]);

  useEffect(() => {
    fetch("/api/samples", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length) setSamples(data);
      })
      .catch(() => undefined);
    void refreshLog();
    const ping = () =>
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => setHealth({ ok: false }));
    void ping();
    const id = setInterval(ping, 8000);
    return () => clearInterval(id);
  }, []);

  const runDetect = useCallback(
    async (imageFile: File, nextMeta?: MetaForm) => {
      setBusy(true);
      setError(null);
      const used = nextMeta ?? meta;
      const form = new FormData();
      form.append("image", imageFile);
      form.append("conf_threshold", String(threshold / 100));
      form.append(
        "metadata",
        JSON.stringify({
          latitude: Number(used.latitude),
          longitude: Number(used.longitude),
          heading_deg: Number(used.heading_deg),
          meters_per_pixel_x: Number(used.meters_per_pixel_x),
          meters_per_pixel_y: Number(used.meters_per_pixel_y),
          survey: used.survey,
          sensor: "side-scan-sonar",
        }),
      );
      try {
        const res = await fetch("/api/detect", { method: "POST", body: form });
        const data = (await res.json()) as DetectResponse;
        if (!res.ok || data.error) {
          throw new Error(data.error || "Detection failed");
        }
        setReport(data.report);
        setOverlay(
          data.overlay_jpeg_base64
            ? `data:image/jpeg;base64,${data.overlay_jpeg_base64}`
            : null,
        );
        toast.success(
          data.report.count
            ? `${data.report.count} anomal${data.report.count === 1 ? "y" : "ies"} localized`
            : "Scan complete — no anomalies above threshold",
        );
        await fetch("/api/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: imageFile.name, report: data.report }),
        });
        await refreshLog();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Detection failed";
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [meta, threshold],
  );

  const loadSample = useCallback(
    async (item: SampleItem) => {
      const imgRes = await fetch(`/samples/${item.file}`);
      const blob = await imgRes.blob();
      const sampleFile = new File([blob], item.file, { type: blob.type || "image/jpeg" });
      let nextMeta = meta;
      try {
        const m = await fetch(`/samples/${item.meta}`).then((r) => r.json());
        nextMeta = {
          latitude: String(m.latitude ?? DEFAULT_META.latitude),
          longitude: String(m.longitude ?? DEFAULT_META.longitude),
          heading_deg: String(m.heading_deg ?? DEFAULT_META.heading_deg),
          meters_per_pixel_x: String(m.meters_per_pixel_x ?? DEFAULT_META.meters_per_pixel_x),
          meters_per_pixel_y: String(m.meters_per_pixel_y ?? DEFAULT_META.meters_per_pixel_y),
          survey: String(m.survey ?? DEFAULT_META.survey),
        };
        setMeta(nextMeta);
      } catch {
        /* keep form */
      }
      setFile(sampleFile);
      setPreview(URL.createObjectURL(sampleFile));
      setOverlay(null);
      setReport(null);
      await runDetect(sampleFile, nextMeta);
    },
    [meta, runDetect],
  );

  const onFile = async (next: File) => {
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setOverlay(null);
    setReport(null);
    await runDetect(next);
  };

  const runJudgeDemo = async () => {
    if (!samples.length) {
      toast.error("Sample gallery is empty");
      return;
    }
    setDemo(true);
    try {
      for (const item of samples.slice(0, 3)) {
        await loadSample(item);
      }
      toast.success("Judge demo complete — pie, map pins, and reports are live");
    } finally {
      setDemo(false);
    }
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    triggerDownload(blob, "anomaly-report.json");
  };

  const downloadCsv = () => {
    if (!report) return;
    const headers = [
      "id",
      "class",
      "confidence_pct",
      "hazard_score",
      "latitude",
      "longitude",
      "width_m",
      "length_m",
    ];
    const rows = report.detections.map((d) =>
      [
        d.id,
        d.class,
        d.confidence,
        d.hazard_score,
        d.latitude ?? "",
        d.longitude ?? "",
        d.dimensions.width_m,
        d.dimensions.length_m,
      ].join(","),
    );
    triggerDownload(
      new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" }),
      "anomaly-report.csv",
    );
  };

  const mapped = useMemo(() => {
    const fromLog = log.flatMap((e) =>
      e.detections
        .filter((d) => d.latitude != null && d.longitude != null)
        .map((d) => ({ ...d, source: e.filename })),
    );
    const ids = new Set(fromLog.map((d) => d.id));
    const extra =
      report?.detections
        .filter((d) => d.latitude != null && d.longitude != null && !ids.has(d.id))
        .map((d) => ({ ...d, source: file?.name })) ?? [];
    return [...fromLog, ...extra];
  }, [log, report, file]);

  const mixRows = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of mapped) counts[d.class] = (counts[d.class] ?? 0) + 1;
    if (report) {
      for (const d of report.detections) {
        if (d.latitude == null || d.longitude == null) {
          counts[d.class] = (counts[d.class] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts).map(([cls, count]) => ({ class: cls, count }));
  }, [mapped, report]);

  return (
    <div className="abyss-bg min-h-screen">
      <header className="border-b border-cyan-400/20 bg-black/35 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-cyan-400 p-2.5 text-sky-950 shadow-[0_0_32px_rgba(34,211,238,0.55)]">
              <Radar className="size-6" />
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-300 uppercase">
                {MODEL_METRICS.org} · {MODEL_METRICS.problem}
              </p>
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                ABYSS
                <span className="ml-2 text-lg font-normal text-cyan-200/80 sm:text-xl">
                  benthic sonar intelligence
                </span>
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-sky-100/85">
                Ghost nets, wrecks, and man-made debris — found in side-scan waterfalls, scored
                against acoustic shadow, and dropped as geotagged cleanup orders.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-cyan-200/90">{clock ? `${clock} IST` : "IST"}</span>
            <Badge
              className={
                health?.ok
                  ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-50"
                  : "border-rose-400/50 bg-rose-500/20"
              }
            >
              {health == null
                ? "Linking detector…"
                : health.ok
                  ? health.trained
                    ? "Trained weights · online"
                    : "Detector online"
                  : "Inference offline"}
            </Badge>
            <Button
              size="lg"
              className="h-10 gap-2 bg-amber-400 px-4 text-sky-950 hover:bg-amber-300"
              onClick={() => void runJudgeDemo()}
              disabled={busy || demo}
            >
              {demo || busy ? <Loader2 className="animate-spin" /> : <Play />}
              Run judge demo
            </Button>
          </div>
        </div>
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-px border-t border-cyan-400/15 bg-cyan-400/10 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["mAP@50", MODEL_METRICS.map50, "held-out sonar val"],
            ["Precision", MODEL_METRICS.precision, "real SSS + FLS"],
            ["Train set", String(MODEL_METRICS.trainImages), `${MODEL_METRICS.valImages} val images`],
            ["Model", MODEL_METRICS.model, `${MODEL_METRICS.params} · ${MODEL_METRICS.imgsz}px`],
            ["Runtime", MODEL_METRICS.device, report ? `${report.inference_ms} ms this ping` : "edge nano"],
            ["Contacts", report ? String(report.count) : "—", `${mapped.length} map pins`],
          ].map(([k, v, d]) => (
            <div key={k} className="bg-[#041821]/80 px-3 py-2.5">
              <p className="font-mono text-[10px] tracking-widest text-cyan-300/80 uppercase">{k}</p>
              <p className="font-heading text-lg font-semibold text-white">{v}</p>
              <p className="truncate text-[11px] text-sky-200/70">{d}</p>
            </div>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5">
        <PipelineStrip active={pipeStep} complete={Boolean(report) && !busy} />

        <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
          <aside className="flex flex-col gap-4">
            <Card className="border-amber-400/30 bg-black/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-amber-100">
                  <Sparkles className="size-4 text-amber-300" /> Live pass
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.tif,.tiff"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                  }}
                />
                <Button
                  className="h-10 w-full bg-cyan-400 text-sky-950 hover:bg-cyan-300"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  <Upload /> Upload sonar image
                </Button>
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-sky-100">
                    <span>Confidence gate</span>
                    <span className="font-mono text-amber-300">{threshold}%</span>
                  </div>
                  <Slider
                    min={5}
                    max={80}
                    value={[threshold]}
                    onValueChange={(v) => {
                      const next = Array.isArray(v) ? Number(v[0]) : Number(v);
                      if (Number.isFinite(next)) setThreshold(next);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  className="w-full border-cyan-400/40"
                  disabled={!file || busy}
                  onClick={() => file && void runDetect(file)}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Waves />}
                  Re-run at {threshold}%
                </Button>
              </CardContent>
            </Card>

            <details className="rounded-xl border border-white/10 bg-black/25 p-3">
              <summary className="cursor-pointer text-sm font-medium text-cyan-100">
                Ping / geotag metadata
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    ["latitude", "Latitude"],
                    ["longitude", "Longitude"],
                    ["heading_deg", "Heading °"],
                    ["meters_per_pixel_x", "m / px across"],
                    ["meters_per_pixel_y", "m / px along"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="col-span-1 space-y-1 text-xs text-sky-200/80">
                    {label}
                    <Input
                      value={meta[key]}
                      onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                      className="h-8"
                    />
                  </label>
                ))}
                <label className="col-span-2 space-y-1 text-xs text-sky-200/80">
                  Survey name
                  <Input
                    value={meta.survey}
                    onChange={(e) => setMeta({ ...meta, survey: e.target.value })}
                    className="h-8"
                  />
                </label>
              </div>
            </details>

            <Card className="border-cyan-400/20 bg-black/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-cyan-100">Real sonar gallery</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {samples.length === 0 ? (
                  <p className="col-span-2 text-sm text-muted-foreground">
                    Sample gallery is empty. Run <code>python ml/prepare_dataset.py</code>.
                  </p>
                ) : (
                  samples.map((s) => (
                    <button
                      key={s.file}
                      type="button"
                      onClick={() => void loadSample(s)}
                      className="overflow-hidden rounded-lg border border-cyan-400/20 text-left transition hover:border-amber-300 hover:shadow-[0_0_16px_rgba(251,191,36,0.25)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/samples/${s.file}`}
                        alt={s.example_class}
                        className="h-20 w-full object-cover"
                      />
                      <span className="block truncate px-2 py-1 text-[11px] text-sky-100/80">
                        {CLASS_LABEL[s.example_class] ?? s.example_class}
                      </span>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>

          <section className="flex min-w-0 flex-col gap-4">
            <SonarTheater
              preview={preview}
              overlay={overlay}
              busy={busy}
              error={error}
              report={report}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
              <Card className="overflow-hidden border-fuchsia-400/30 bg-gradient-to-b from-fuchsia-500/15 to-black/40">
                <CardHeader className="pb-1">
                  <CardTitle className="text-base text-fuchsia-100">Class mix</CardTitle>
                  <p className="text-xs text-fuchsia-100/70">
                    {mixRows.length ? "Live pie from this session" : "Taxonomy colour key"}
                  </p>
                </CardHeader>
                <CardContent>
                  <ClassMixPie rows={mixRows} height={250} />
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-cyan-400/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-cyan-100">
                    NIOT survey track · Bay of Bengal
                  </CardTitle>
                  <p className="text-xs text-sky-100/70">
                    Cyan dashed line is the planned AUV transect. Coloured pins are model contacts.
                  </p>
                </CardHeader>
                <CardContent className="relative h-[300px] p-0 sm:h-[360px]">
                  <SonarMap detections={mapped} />
                  <div className="pointer-events-none absolute right-3 bottom-3 z-[1000] rounded-lg bg-sky-950/90 px-2 py-1.5 text-[10px] text-cyan-50">
                    {mapped.length ? `${mapped.length} geotagged hazards` : "13.08°N 80.37°E"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(CLASS_LABEL).map(([cls, label]) => (
                <span
                  key={cls}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-sky-50"
                >
                  <span className="size-2.5 rounded-full" style={{ background: CLASS_COLOR[cls] }} />
                  {label}
                </span>
              ))}
            </div>

            <Tabs defaultValue="report">
              <TabsList className="h-auto flex-wrap bg-cyan-950/70">
                <TabsTrigger value="report">Cleanup report</TabsTrigger>
                <TabsTrigger value="map">Full map</TabsTrigger>
                <TabsTrigger value="charts">Ops graphs</TabsTrigger>
              </TabsList>
              <TabsContent value="report">
                <Card className="border-amber-400/20 bg-black/30">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base text-amber-100">Geotagged anomaly report</CardTitle>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={downloadJson} disabled={!report}>
                        <Download /> JSON
                      </Button>
                      <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!report}>
                        <Download /> CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!report ? (
                      <p className="text-sm text-sky-200/70">
                        Run the judge demo to generate a structured cleanup order (JSON + CSV).
                      </p>
                    ) : report.count === 0 ? (
                      <p className="text-sm text-sky-200/70">
                        No man-made anomalies above the current confidence gate.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Class</TableHead>
                              <TableHead>Conf.</TableHead>
                              <TableHead>Hazard</TableHead>
                              <TableHead>Lat / Lon</TableHead>
                              <TableHead>Size (m)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report.detections.map((d) => (
                              <TableRow key={d.id}>
                                <TableCell className="font-mono text-xs">{d.id}</TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ background: CLASS_COLOR[d.class] }}
                                    />
                                    {CLASS_LABEL[d.class] ?? d.class}
                                  </span>
                                </TableCell>
                                <TableCell>{d.confidence.toFixed(0)}%</TableCell>
                                <TableCell>{d.hazard_score}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {d.latitude != null && d.longitude != null
                                    ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}`
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {d.dimensions.width_m} × {d.dimensions.length_m}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="map">
                <Card className="overflow-hidden border-cyan-400/25">
                  <CardContent className="h-[540px] p-0">
                    <SonarMap detections={mapped} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="charts">
                <Card className="border-fuchsia-400/20 bg-black/25">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Operations intelligence</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Every image entered this session feeds the graphs. Toggle views for the jury.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <SurveyCharts entries={log} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
