"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Loader2,
  Map as MapIcon,
  Play,
  Radar,
  ScanLine,
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
  { ssr: false, loading: () => <div className="h-full animate-pulse bg-white/5" /> },
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
  const [demoHint, setDemoHint] = useState("");
  const booted = useRef(false);

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

  useEffect(() => {
    if (booted.current || !health?.ok || !samples[0]) return;
    booted.current = true;
    void loadSample(samples[0]);
  }, [health, samples, loadSample]);

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
      const pack = samples.slice(0, 3);
      let i = 0;
      for (const item of pack) {
        i += 1;
        setDemoHint(`Judge demo ${i} / ${pack.length} · ${item.file}`);
        await loadSample(item);
      }
      setDemoHint("Demo stacked — map, pie, and cleanup order are live");
      toast.success("Demo complete — open Map, Analytics, and Reports");
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

  const downloadBriefing = () => {
    if (!report) return;
    const rows = report.detections
      .map(
        (d) =>
          `<tr><td>${d.id}</td><td>${CLASS_LABEL[d.class] ?? d.class}</td><td>${d.confidence.toFixed(0)}%</td><td>${d.hazard_score}</td><td>${d.latitude ?? "—"}, ${d.longitude ?? "—"}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aua Vision briefing</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0b1220;color:#f4f1ea;padding:32px}h1{color:#c9a227}table{border-collapse:collapse;width:100%}td,th{border:1px solid #2a3348;padding:8px;text-align:left}</style>
</head><body><p>MoES · NIOT · PS 26057</p><h1>Aua Vision cleanup briefing</h1>
<p>${report.survey_id} · ${report.model} · ${report.inference_ms} ms · ${report.count} contacts</p>
<table><thead><tr><th>ID</th><th>Class</th><th>Conf</th><th>Hazard</th><th>Lat, Lon</th></tr></thead><tbody>${rows}</tbody></table>
<p>Trained YOLO11n mAP@50 74.9% on SCTD + Marine Debris FLS + SeabedObjects-KLSG.</p></body></html>`;
    triggerDownload(new Blob([html], { type: "text/html" }), "abyss-briefing.html");
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
      <header className="border-b border-white/10 bg-[#0b1220]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-[#c9a227] p-2.5 text-[#0b1220]">
              <Radar className="size-6" />
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-[0.22em] text-[#c9a227] uppercase">
                {MODEL_METRICS.org} · {MODEL_METRICS.problem}
              </p>
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Aua Vision
              </h1>
              <p className="mt-1 max-w-xl text-sm text-white/70">
                Professional sonar intelligence for ghost gear, wrecks, and seabed debris.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-white/60">{clock ? `${clock} IST` : "IST"}</span>
            <Badge
              className={
                health?.ok
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                  : "border-red-500/40 bg-red-500/15"
              }
            >
              {health == null
                ? "Linking detector…"
                : health.ok
                  ? health.trained
                    ? "Detector online"
                    : "Detector online"
                  : "Inference offline"}
            </Badge>
            <Button
              size="lg"
              className="h-10 gap-2 bg-[#c9a227] px-4 text-[#0b1220] hover:bg-[#ddb84a]"
              onClick={() => void runJudgeDemo()}
              disabled={busy || demo}
            >
              {demo || busy ? <Loader2 className="animate-spin" /> : <Play />}
              {demo ? "Demo running" : "Run live demo"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5">
        <Tabs defaultValue="scan" className="gap-5">
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-white/10 bg-transparent p-0"
          >
            <TabsTrigger value="scan" className="rounded-none px-4 py-3">
              <ScanLine /> Scan
            </TabsTrigger>
            <TabsTrigger value="map" className="rounded-none px-4 py-3">
              <MapIcon /> Map
            </TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-none px-4 py-3">
              <BarChart3 /> Analytics
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded-none px-4 py-3">
              <FileSpreadsheet /> Reports
            </TabsTrigger>
            <TabsTrigger value="model" className="rounded-none px-4 py-3">
              <Sparkles /> Model
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-5">
            <PipelineStrip
              active={pipeStep}
              complete={Boolean(report) && !busy}
              hint={
                demoHint ||
                (busy
                  ? "Processing sonar log"
                  : report
                    ? "Last ping fused and geotagged"
                    : "Standing by")
              }
            />
            <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
              <aside className="flex flex-col gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Acquire log</CardTitle>
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
                      className="h-10 w-full bg-[#c9a227] text-[#0b1220] hover:bg-[#ddb84a]"
                      onClick={() => inputRef.current?.click()}
                      disabled={busy}
                    >
                      <Upload /> Upload sonar image
                    </Button>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-white/70">
                        <span>Confidence gate</span>
                        <span className="font-mono text-[#c9a227]">{threshold}%</span>
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
                      className="w-full"
                      disabled={!file || busy}
                      onClick={() => file && void runDetect(file)}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Waves />}
                      Re-run at {threshold}%
                    </Button>
                  </CardContent>
                </Card>
                <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Ping / geotag metadata</summary>
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
                      <label key={key} className="col-span-1 space-y-1 text-xs text-white/65">
                        {label}
                        <Input
                          value={meta[key]}
                          onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                          className="h-8"
                        />
                      </label>
                    ))}
                    <label className="col-span-2 space-y-1 text-xs text-white/65">
                      Survey name
                      <Input
                        value={meta.survey}
                        onChange={(e) => setMeta({ ...meta, survey: e.target.value })}
                        className="h-8"
                      />
                    </label>
                  </div>
                </details>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Reference gallery</CardTitle>
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
                          className={`overflow-hidden rounded-lg border text-left transition hover:border-[#c9a227] ${
                            file?.name === s.file
                              ? "border-[#c9a227] ring-1 ring-[#c9a227]/50"
                              : "border-white/10"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/samples/${s.file}`}
                            alt={s.example_class}
                            className="h-20 w-full object-cover"
                          />
                          <span className="block truncate px-2 py-1 text-[11px] text-white/70">
                            {CLASS_LABEL[s.example_class] ?? s.example_class}
                          </span>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>
              </aside>
              <SonarTheater
                preview={preview}
                overlay={overlay}
                busy={busy}
                error={error}
                report={report}
                filename={file?.name}
              />
            </div>
          </TabsContent>

          <TabsContent value="map">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Survey map</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Gold transect is the planned AUV path. Pins are geotagged detections from Scan.
                </p>
              </CardHeader>
              <CardContent className="relative h-[560px] p-0">
                <SonarMap key="full-map" detections={mapped} />
                <div className="pointer-events-none absolute right-3 bottom-3 z-[1000] rounded-md bg-[#0b1220]/90 px-2 py-1.5 text-[11px] text-[#e8d5a3]">
                  {mapped.length ? `${mapped.length} geotagged hazards` : "13.08°N 80.37°E"}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle>Class mix</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {mixRows.length ? "Live session mix" : "Taxonomy colour key"}
                  </p>
                </CardHeader>
                <CardContent>
                  <ClassMixPie rows={mixRows} height={280} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Operations graphs</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Intake, confidence, latency, and hazard from every scanned image.
                  </p>
                </CardHeader>
                <CardContent>
                  <SurveyCharts entries={log} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Cleanup report</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Export JSON, CSV, or an HTML briefing for the operations team.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={downloadJson} disabled={!report}>
                    <Download /> JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!report}>
                    <Download /> CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadBriefing} disabled={!report}>
                    <Download /> Briefing
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!report ? (
                  <p className="text-sm text-muted-foreground">
                    Run a scan or the live demo, then return here for the structured order.
                  </p>
                ) : report.count === 0 ? (
                  <p className="text-sm text-muted-foreground">
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

          <TabsContent value="model">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["mAP@50", MODEL_METRICS.map50, "Held-out sonar validation"],
                ["Precision", MODEL_METRICS.precision, "Real SSS and FLS imagery"],
                ["Recall", MODEL_METRICS.recall, "After shadow fusion"],
                ["Train / val", `${MODEL_METRICS.trainImages} / ${MODEL_METRICS.valImages}`, "Public labelled pings"],
                ["Architecture", MODEL_METRICS.model, `${MODEL_METRICS.params} · ${MODEL_METRICS.imgsz} px`],
                ["Runtime", MODEL_METRICS.device, report ? `${report.inference_ms} ms this ping` : "Edge nano"],
              ].map(([k, v, d]) => (
                <Card key={k}>
                  <CardContent className="pt-5">
                    <p className="font-mono text-[10px] tracking-widest text-[#c9a227] uppercase">{k}</p>
                    <p className="font-heading mt-1 text-2xl font-semibold">{v}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{d}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[
                ["Real sonar, not COCO", "SCTD wrecks, ARIS FLS debris, KLSG seabed objects."],
                ["Shadow-aware scores", "YOLO × contrast × acoustic-shadow penalty."],
                ["Ops-ready output", "Lat/lon, size in metres, hazard rank, JSON/CSV."],
              ].map(([t, d]) => (
                <Card key={t}>
                  <CardHeader>
                    <CardTitle className="text-base">{t}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{d}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <footer className="mt-8 border-t border-white/10 pb-8 pt-4 text-center text-[11px] text-white/45">
          Aua Vision · SCTD 1.0 · Marine Debris FLS · SeabedObjects-KLSG · YOLO11n {MODEL_METRICS.params} ·
          mAP@50 {MODEL_METRICS.map50}
        </footer>
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
