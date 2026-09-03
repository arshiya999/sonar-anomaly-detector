"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  Radar,
  ShieldAlert,
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
import { CLASS_LABEL } from "@/lib/labels";
import type { DetectReport, DetectResponse, SampleItem, ScanLogEntry } from "@/lib/types";
import { SurveyCharts } from "@/components/survey-charts";

const SonarMap = dynamic(
  () => import("@/components/sonar-map").then((m) => m.SonarMap),
  { ssr: false, loading: () => <div className="h-full animate-pulse rounded-xl bg-muted" /> },
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

  const refreshLog = () =>
    fetch("/api/log", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.entries)) setLog(data.entries);
      })
      .catch(() => undefined);

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

  const onFile = async (next: File) => {
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setOverlay(null);
    setReport(null);
    await runDetect(next);
  };

  const loadSample = async (item: SampleItem) => {
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

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_10%_-10%,rgba(45,212,191,0.12),transparent_45%),radial-gradient(900px_circle_at_100%_0%,rgba(56,189,248,0.08),transparent_40%)]">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary">
              <Radar className="size-5" />
            </div>
            <div>
              <p className="text-xs tracking-[0.18em] text-primary uppercase">
                MoES · NIOT · PS 26057
              </p>
              <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
                ABYSS — Automated Benthic Yield Sonar Scanner
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Detect ghost gear, wrecks, and man-made debris in side-scan sonar logs. Speckle
                filtering, YOLO detection, acoustic-shadow suppression, and geotagged reports.
              </p>
            </div>
          </div>
          <Badge
            variant={health == null ? "outline" : health.ok ? "secondary" : "destructive"}
            className="w-fit"
          >
            {health == null
              ? "Checking detector…"
              : health.ok
                ? health.trained
                  ? "Trained sonar weights online"
                  : "Detector online (base weights)"
                : "Inference offline"}
          </Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="size-4" /> Sonar log
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
              <Button className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
                Upload raw sonar image
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG / JPEG waterfall or SSS mosaic. Optional ping metadata goes in the form below.
              </p>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span>Confidence gate</span>
                  <span className="font-mono text-primary">{threshold}%</span>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ping / geotag metadata</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(
                [
                  ["latitude", "Latitude"],
                  ["longitude", "Longitude"],
                  ["heading_deg", "Heading °"],
                  ["meters_per_pixel_x", "m / px across"],
                  ["meters_per_pixel_y", "m / px along"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="col-span-1 space-y-1 text-xs text-muted-foreground">
                  {label}
                  <Input
                    value={meta[key]}
                    onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                    className="h-8"
                  />
                </label>
              ))}
              <label className="col-span-2 space-y-1 text-xs text-muted-foreground">
                Survey name
                <Input
                  value={meta.survey}
                  onChange={(e) => setMeta({ ...meta, survey: e.target.value })}
                  className="h-8"
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Real sonar samples</CardTitle>
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
                    className="overflow-hidden rounded-lg border border-border text-left transition hover:border-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/samples/${s.file}`}
                      alt={s.example_class}
                      className="h-20 w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">
                      {CLASS_LABEL[s.example_class] ?? s.example_class}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Anomalies"
              value={report ? String(report.count) : "—"}
              hint="This image, after noise filter"
            />
            <Stat
              label="Inference"
              value={report ? `${report.inference_ms} ms` : "—"}
              hint={report?.model || "edge YOLO11n"}
            />
            <Stat
              label="Highest risk"
              value={
                report?.detections[0]
                  ? `${CLASS_LABEL[report.detections[0].class] ?? report.detections[0].class}`
                  : "—"
              }
              hint={
                report?.detections[0]
                  ? `${report.detections[0].confidence.toFixed(0)}% fused confidence`
                  : "Awaiting scan"
              }
            />
            <Stat
              label="Logged images"
              value={String(log.length)}
              hint={`${mapped.length} map pins kept on zoom`}
            />
          </div>

          <Tabs defaultValue="overlay">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="overlay">Detections</TabsTrigger>
              <TabsTrigger value="map">Geotagged map</TabsTrigger>
              <TabsTrigger value="report">Structured report</TabsTrigger>
              <TabsTrigger value="charts">Charts & log</TabsTrigger>
            </TabsList>
            <TabsContent value="overlay">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {busy && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-primary">
                      <Loader2 className="size-4 animate-spin" />
                      Running speckle filter, detector, and shadow scoring…
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
                      <ShieldAlert className="size-4" />
                      {error}
                    </div>
                  )}
                  {!preview && !busy && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                      <Radar className="size-10 opacity-50" />
                      <p>Upload a sonar waterfall or pick a real sample to start a survey pass.</p>
                    </div>
                  )}
                  {(overlay || preview) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={overlay ?? preview ?? ""}
                      alt="Sonar detections overlay"
                      className="max-h-[640px] w-full bg-black object-contain"
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="map">
              <Card className="overflow-hidden">
                <CardContent className="h-[520px] p-0">
                  {mapped.length === 0 ? (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                      No geotagged hits yet. Run a scan with latitude/longitude metadata — pins stay
                      when you zoom.
                    </div>
                  ) : (
                    <div className="relative h-full">
                      <p className="pointer-events-none absolute top-3 left-3 z-[1000] rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                        {mapped.length} recorded hazard{mapped.length === 1 ? "" : "s"} — scroll to
                        zoom, pins stay put
                      </p>
                      <SonarMap detections={mapped} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="report">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Anomaly report</CardTitle>
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
                    <p className="text-sm text-muted-foreground">No report generated yet.</p>
                  ) : report.count === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      The model found no man-made anomalies above the current confidence gate.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead>Conf.</TableHead>
                            <TableHead>Lat / Lon</TableHead>
                            <TableHead>Size (m)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.detections.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="font-mono text-xs">{d.id}</TableCell>
                              <TableCell>{CLASS_LABEL[d.class] ?? d.class}</TableCell>
                              <TableCell>{d.confidence.toFixed(0)}%</TableCell>
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
            <TabsContent value="charts">
              <Card className="border-primary/15 bg-gradient-to-b from-primary/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Operations intelligence</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Live graphs from every sonar image entered this session. Toggle views, then
                    zoom the map — logged pins stay on the chart.
                  </p>
                </CardHeader>
                <CardContent>
                  <SurveyCharts entries={log} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
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
