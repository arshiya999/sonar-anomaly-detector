"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Info,
  LayoutDashboard,
  Loader2,
  Map as MapIcon,
  Menu,
  ScanLine,
  Settings,
  ShieldAlert,
  Target,
  TriangleAlert,
  Upload,
  User,
  Waves,
  Images,
  ListChecks,
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
import { CLASS_COLOR, CLASS_LABEL, confidenceBand, confidenceColor } from "@/lib/labels";
import { MODEL_METRICS } from "@/lib/metrics";
import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";
import { formatIst } from "@/lib/format";
import { textLinesToPdf } from "@/lib/pdf";
import type { DetectReport, DetectResponse, Detection, ScanLogEntry, SurveyPin } from "@/lib/types";
import {
  coordsFromReport,
  detectionsFromLog,
  geotagReport,
  mergeLogs,
  pinsFromLog,
  plotPosition,
  toLogEntry,
} from "@/lib/geo";
import { SurveyCharts } from "@/components/survey-charts";
import { ClassMixPie } from "@/components/class-mix-pie";
import { BrandMark } from "@/components/brand-mark";
import { PipelineStrip } from "@/components/pipeline-strip";
import { SonarTheater } from "@/components/sonar-theater";
import { BatchResultsPanel, type BatchRun, type BatchRow } from "@/components/batch-results";
import { validateSonarFile } from "@/lib/sonar-validate";
import { mapPool } from "@/lib/map-pool";

/** This preview branch must not write to the live Render log or mix in production surveys. */
const PREVIEW_ISOLATION = true;
const MAX_BATCH = 200;
const DETECT_CONCURRENCY = 4;

const SonarMap = dynamic(
  () => import("@/components/sonar-map").then((m) => m.SonarMap),
  { ssr: false, loading: () => <div className="h-full min-h-[280px] animate-pulse bg-slate-200" /> },
);

type PageId =
  | "dashboard"
  | "upload"
  | "analysis"
  | "detections"
  | "map"
  | "report"
  | "results"
  | "history"
  | "settings"
  | "about";

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "analysis", label: "Analysis", icon: ScanLine },
  { id: "results", label: "Batch results", icon: ListChecks },
  { id: "detections", label: "Detections", icon: Target },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "report", label: "Report", icon: FileSpreadsheet },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "about", label: "About", icon: Info },
];

type MetaForm = {
  latitude: string;
  longitude: string;
  heading_deg: string;
  meters_per_pixel_x: string;
  meters_per_pixel_y: string;
  survey: string;
};

const DEFAULT_META: MetaForm = {
  latitude: "",
  longitude: "",
  heading_deg: "",
  meters_per_pixel_x: "",
  meters_per_pixel_y: "",
  survey: "",
};

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function saveOrigin(meta: MetaForm) {
  const lat = optionalNumber(meta.latitude);
  const lon = optionalNumber(meta.longitude);
  if (lat == null || lon == null) return;
  try {
    localStorage.setItem("aqua-survey-origin", JSON.stringify(meta));
  } catch {
    /* private mode */
  }
}

async function resolveGps(used: MetaForm): Promise<MetaForm> {
  const next = { ...used };
  if (optionalNumber(next.latitude) != null && optionalNumber(next.longitude) != null) {
    if (!next.heading_deg.trim()) next.heading_deg = "0";
    if (!next.meters_per_pixel_x.trim()) next.meters_per_pixel_x = "0.08";
    if (!next.meters_per_pixel_y.trim()) next.meters_per_pixel_y = "0.05";
    return next;
  }
  try {
    const raw = localStorage.getItem("aqua-survey-origin");
    if (raw) {
      const saved = JSON.parse(raw) as MetaForm;
      if (optionalNumber(saved.latitude) != null && optionalNumber(saved.longitude) != null) {
        next.latitude = saved.latitude;
        next.longitude = saved.longitude;
        next.heading_deg = next.heading_deg || saved.heading_deg || "0";
        next.meters_per_pixel_x = next.meters_per_pixel_x || saved.meters_per_pixel_x || "0.08";
        next.meters_per_pixel_y = next.meters_per_pixel_y || saved.meters_per_pixel_y || "0.05";
        return next;
      }
    }
  } catch {
    /* ignore */
  }
  return next;
}

function applyDeviceGps(setMeta: (m: MetaForm) => void, meta: MetaForm) {
  if (!navigator.geolocation) {
    toast.error("This browser has no geolocation API");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const next = {
        ...meta,
        latitude: String(pos.coords.latitude),
        longitude: String(pos.coords.longitude),
        heading_deg: meta.heading_deg.trim() || "0",
        meters_per_pixel_x: meta.meters_per_pixel_x.trim() || "0.08",
        meters_per_pixel_y: meta.meters_per_pixel_y.trim() || "0.05",
      };
      setMeta(next);
      saveOrigin(next);
      toast.success("Live origin set from this device GPS");
    },
    () => toast.error("Device GPS denied or timed out"),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 5_000 },
  );
}

type Mapped = Detection & { source?: string };

export function Dashboard() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [report, setReport] = useState<DetectReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(22);
  const [health, setHealth] = useState<{
    ok: boolean;
    hosted?: boolean;
    trained?: boolean;
    weights?: string;
    error?: string;
    ml?: string;
  } | null>(null);
  const [meta, setMeta] = useState<MetaForm>(DEFAULT_META);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const logRef = useRef<ScanLogEntry[]>([]);
  logRef.current = log;
  const [pipeStep, setPipeStep] = useState(0);
  const [clock, setClock] = useState("");
  const [batch, setBatch] = useState<BatchRun | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const batchCancel = useRef(false);

  const refreshLog = useCallback(() => {
    if (PREVIEW_ISOLATION) return Promise.resolve();
    return fetch("/api/log", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.entries)) return;
        setLog((prev) => mergeLogs(data.entries as ScanLogEntry[], prev));
        const latestEntry = data.entries[0] as ScanLogEntry | undefined;
        const overlayFromDb = latestEntry?.overlay_url ?? latestEntry?.detections?.find((d) => d.overlay_url)?.overlay_url;
        if (overlayFromDb) {
          setOverlay((prev) => (prev?.startsWith("data:") ? prev : overlayFromDb));
        }
      })
      .catch(() => undefined);
  }, []);

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
    void refreshLog();
    const ping = () =>
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then(setHealth)
        .catch(() =>
          setHealth({
            ok: false,
            hosted: window.location.hostname.includes("vercel.app"),
          }),
        );
    void ping();
    const id = setInterval(ping, 20000);
  }, [refreshLog]);

  const runDetect = useCallback(
    async (
      imageFile: File,
      nextMeta?: MetaForm,
      opts?: { quiet?: boolean; keepBusy?: boolean; skipOverlay?: boolean },
    ) => {
      setBusy(true);
      setError(null);
      const used = await resolveGps(nextMeta ?? meta);
      setMeta(used);
      saveOrigin(used);
      const metadata: Record<string, unknown> = {
        sensor: "side-scan-sonar",
        survey: used.survey.trim() || imageFile.name,
      };
      const lat = optionalNumber(used.latitude);
      const lon = optionalNumber(used.longitude);
      const heading = optionalNumber(used.heading_deg);
      const mppx = optionalNumber(used.meters_per_pixel_x);
      const mppy = optionalNumber(used.meters_per_pixel_y);
      if (lat != null && lon != null) {
        metadata.latitude = lat;
        metadata.longitude = lon;
      }
      if (heading != null) metadata.heading_deg = heading;
      if (mppx != null) metadata.meters_per_pixel_x = mppx;
      if (mppy != null) metadata.meters_per_pixel_y = mppy;
      try {
        const hosts = PREVIEW_ISOLATION
          ? [PUBLIC_ML_URL, ""]
          : [PUBLIC_OPS_URL, PUBLIC_ML_URL, health?.ml || ""];
        const detectUrls = [
          ...hosts
            .map((h) => (h || "").replace(/\/+$/, ""))
            .filter((h, i, arr) => h.startsWith("http") && arr.indexOf(h) === i)
            .map((h) => `${h}/detect`),
          "/api/detect",
        ].filter((u, i, arr) => arr.indexOf(u) === i);
        let data: DetectResponse | null = null;
        let lastError = "Detection failed";
        for (const detectUrl of detectUrls) {
          const formTry = new FormData();
          formTry.append("image", imageFile);
          formTry.append("conf_threshold", String(threshold / 100));
          formTry.append("metadata", JSON.stringify(metadata));
          formTry.append("return_overlay", opts?.skipOverlay ? "false" : "true");
          try {
            const res = await fetch(detectUrl, {
              method: "POST",
              body: formTry,
              signal: AbortSignal.timeout(120_000),
            });
            if (res.status === 404) {
              lastError = `No detector at ${detectUrl}`;
              continue;
            }
            const parsed = (await res.json()) as DetectResponse;
            if (res.ok && parsed.report && !parsed.error) {
              data = parsed;
              break;
            }
            lastError = parsed.error || `Detection failed (${res.status})`;
          } catch (err) {
            lastError =
              err instanceof Error ? err.message : "Detection failed";
          }
        }
        if (!data?.report) {
          throw new Error(lastError);
        }
        const overlayData =
          opts?.skipOverlay || !data.overlay_jpeg_base64
            ? null
            : `data:image/jpeg;base64,${data.overlay_jpeg_base64}`;
        const [reportLat, reportLon] = coordsFromReport(data.report);
        const placed = plotPosition(
          logRef.current,
          lat ?? reportLat,
          lon ?? reportLon,
        );
        const geoReport = geotagReport(data.report, placed.lat, placed.lon);
        const localEntry = toLogEntry({
          id: `local-${Date.now()}`,
          filename: imageFile.name,
          report: geoReport,
          lat: placed.lat,
          lon: placed.lon,
          overlay: overlayData,
        });
        setReport(geoReport);
        setOverlay(overlayData);
        setLog((prev) => mergeLogs(prev, [localEntry]));
        if (placed.gnss) {
          setMeta((m) => ({
            ...m,
            latitude: m.latitude.trim() || String(placed.lat.toFixed(5)),
            longitude: m.longitude.trim() || String(placed.lon.toFixed(5)),
          }));
        }
        if (!opts?.quiet) {
          toast.success(
            geoReport.count
              ? `${geoReport.count} anomal${geoReport.count === 1 ? "y" : "ies"} scored — pin on map`
              : "Ping processed — pin on map (no class above threshold)",
          );
          toast.message(
            placed.gnss
              ? `Pinned at ${placed.lat.toFixed(4)}, ${placed.lon.toFixed(4)}`
              : `Pinned on survey plot ${placed.lat.toFixed(4)}, ${placed.lon.toFixed(4)} — click the map or type GPS for true position`,
          );
        }
        if (!PREVIEW_ISOLATION) {
          const persist = await fetch("/api/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: imageFile.name,
              report: geoReport,
              overlay_jpeg_base64: data.overlay_jpeg_base64,
            }),
          });
          if (persist.ok) {
            const saved = (await persist.json()) as { entries?: ScanLogEntry[] };
            if (Array.isArray(saved.entries)) {
              setLog((prev) => mergeLogs(saved.entries as ScanLogEntry[], prev));
            }
          }
          await refreshLog();
        }
        return { geoReport, localEntry };
      } catch (err) {
        const timedOut =
          (err instanceof DOMException && err.name === "TimeoutError") ||
          (err instanceof Error && /timeout|aborted/i.test(err.message));
        const message = timedOut
          ? "Detector is scoring this ping on cloud CPU — first run after idle can take 1–2 minutes. Wait, then tap Evaluate again. Do not refresh."
          : err instanceof Error
            ? err.message
            : "Detection failed";
        setError(message);
        if (!opts?.quiet) toast.error(message);
        return null;
      } finally {
        if (!opts?.keepBusy) setBusy(false);
      }
    },
    [meta, threshold, refreshLog, health],
  );

  const onFiles = useCallback(
    async (picked: File[]) => {
      const images = picked.slice(0, MAX_BATCH);
      if (!images.length) {
        toast.error("No files in that selection");
        return;
      }
      batchCancel.current = false;
      const startedAt = Date.now();
      const seedRows: BatchRow[] = images.map((f, i) => ({
        id: `${startedAt}-${i}-${f.name}`,
        filename: f.name,
        status: "queued",
        predicted: null,
        count: 0,
        inference_ms: 0,
        preprocess_ms: 0,
        postprocess_ms: 0,
        wall_ms: 0,
      }));
      setBatch({
        uploaded: images.length,
        valid: 0,
        invalid: 0,
        analyzed: 0,
        failed: 0,
        done: 0,
        total: images.length,
        phase: "validate",
        current: "Checking files…",
        startedAt,
        elapsedMs: 0,
        finished: false,
        rows: seedRows,
      });
      setBusy(true);
      setError(null);
      setPage("results");
      setFile(images[0]);
      setPreview(URL.createObjectURL(images[0]));
      toast.message(`Checking ${images.length} files, then analyzing valid sonar in parallel`);

      const checks = await mapPool(images, 6, async (file, i) => {
        const v = await validateSonarFile(file);
        return { file, i, v };
      });
      if (batchCancel.current) {
        setBusy(false);
        return;
      }

      const validFiles: { file: File; i: number }[] = [];
      let invalidCount = 0;
      const afterValidate: BatchRow[] = seedRows.map((row) => ({ ...row }));
      for (const { i, v } of checks) {
        if (v.ok) {
          validFiles.push({ file: images[i], i });
        } else {
          invalidCount += 1;
          afterValidate[i] = { ...afterValidate[i], status: "invalid", reason: v.reason };
        }
      }
      setBatch((prev) =>
        prev
          ? {
              ...prev,
              phase: "analyze",
              valid: images.length - invalidCount,
              invalid: invalidCount,
              done: invalidCount,
              current: "Starting detector…",
              elapsedMs: Date.now() - startedAt,
              rows: afterValidate,
            }
          : prev,
      );

      await mapPool(validFiles, DETECT_CONCURRENCY, async ({ file, i }) => {
        if (batchCancel.current) return;
        setBatch((prev) =>
          prev
            ? { ...prev, current: file.name, elapsedMs: Date.now() - startedAt }
            : prev,
        );
        const t0 = Date.now();
        const result = await runDetect(file, undefined, {
          quiet: true,
          keepBusy: true,
          skipOverlay: true,
        });
        const wall = Date.now() - t0;
        const detections = result?.geoReport.detections ?? [];
        const top = [...detections].sort((a, b) => b.confidence - a.confidence)[0];
        setBatch((prev) => {
          if (!prev) return prev;
          const rows = prev.rows.map((row) => ({ ...row }));
          if (result?.geoReport) {
            rows[i] = {
              ...rows[i],
              status: "analyzed",
              predicted: top?.class ?? null,
              count: detections.length,
              inference_ms: result.geoReport.inference_ms ?? 0,
              preprocess_ms: result.geoReport.preprocess_ms ?? 0,
              postprocess_ms: result.geoReport.postprocess_ms ?? 0,
              wall_ms: wall,
              reason: detections.length ? undefined : "Valid sonar — no contact above the confidence gate",
            };
          } else {
            rows[i] = {
              ...rows[i],
              status: "failed",
              reason: "Detector did not return a report",
              wall_ms: wall,
            };
          }
          const analyzed = rows.filter((r) => r.status === "analyzed").length;
          const failed = rows.filter((r) => r.status === "failed").length;
          const invalid = rows.filter((r) => r.status === "invalid").length;
          return {
            ...prev,
            analyzed,
            failed,
            done: analyzed + failed + invalid,
            elapsedMs: Date.now() - startedAt,
            rows,
          };
        });
      });

      setBatch((prev) =>
        prev
          ? {
              ...prev,
              phase: "done",
              finished: true,
              current: "",
              elapsedMs: Date.now() - startedAt,
              done: prev.total,
            }
          : prev,
      );
      setBusy(false);
      setQueue([]);
      toast.success("Run complete — see Batch results");
    },
    [runDetect],
  );

  const pickMapOrigin = useCallback((lat: number, lon: number) => {
    const next: MetaForm = {
      ...meta,
      latitude: lat.toFixed(5),
      longitude: lon.toFixed(5),
      heading_deg: meta.heading_deg.trim() || "0",
      meters_per_pixel_x: meta.meters_per_pixel_x.trim() || "0.08",
      meters_per_pixel_y: meta.meters_per_pixel_y.trim() || "0.05",
    };
    setMeta(next);
    saveOrigin(next);
    toast.success(`Survey origin set to ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }, [meta]);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ surveys: log, latest: report }, null, 2)], {
      type: "application/json",
    });
    triggerDownload(blob, "anomaly-report.json");
  };

  const downloadCsv = () => {
    const headers = [
      "scan",
      "id",
      "class",
      "confidence_pct",
      "hazard_score",
      "latitude",
      "longitude",
      "width_m",
      "length_m",
    ];
    const rows = detectionsFromLog(log).map((d) =>
      [
        d.source ?? "",
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
    const rows = detectionsFromLog(log)
      .map(
        (d) =>
          `<tr><td>${d.source ?? ""}</td><td>${d.id}</td><td>${CLASS_LABEL[d.class] ?? d.class}</td><td>${d.confidence.toFixed(0)}%</td><td>${d.hazard_score}</td><td>${d.latitude ?? "—"}, ${d.longitude ?? "—"}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aqua Vision briefing</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#cfeaf3;color:#083344;padding:32px}h1{color:#0369a1}table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #7dd3fc;padding:8px;text-align:left}</style>
</head><body><h1>Aqua Vision cleanup briefing</h1>
<p>${log.length} sonar images · ${allDetections.length} contacts</p>
<table><thead><tr><th>Image</th><th>ID</th><th>Class</th><th>Conf</th><th>Hazard</th><th>Lat, Lon</th></tr></thead><tbody>${rows}</tbody></table>
<p>Trained YOLO11n mAP@50 74.9% on SCTD + Marine Debris FLS + SeabedObjects-KLSG.</p></body></html>`;
    triggerDownload(new Blob([html], { type: "text/html" }), "aqua-vision-briefing.html");
  };

  const downloadPdf = () => {
    const rows = detectionsFromLog(log);
    const lines = [
      `Generated ${new Date().toISOString()}`,
      `${log.length} sonar images · ${rows.length} contacts`,
      "",
      ...log.map((e) => {
        const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
        const cls = top ? CLASS_LABEL[top.class] ?? top.class : "no detection";
        const gps =
          e.latitude != null && e.longitude != null
            ? `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`
            : "unmapped";
        return `${formatIst(e.at)} | ${e.filename} | ${cls} | hits ${e.count} | ${gps}`;
      }),
      "",
      "Contacts",
      ...rows.map((d) => {
        const gps =
          d.latitude != null && d.longitude != null
            ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}`
            : "unmapped";
        return `${d.source ?? ""} | ${CLASS_LABEL[d.class] ?? d.class} | ${d.confidence.toFixed(0)}% | hazard ${d.hazard_score} | ${gps}`;
      }),
    ];
    triggerDownload(textLinesToPdf("Aqua Vision cleanup report", lines), "aqua-vision-report.pdf");
  };

  const mapped = useMemo(() => detectionsFromLog(log).filter((d) => d.latitude != null && d.longitude != null), [log]);

  const allDetections: Mapped[] = useMemo(() => detectionsFromLog(log), [log]);

  const mixRows = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDetections) counts[d.class] = (counts[d.class] ?? 0) + 1;
    return Object.entries(counts).map(([cls, count]) => ({ class: cls, count }));
  }, [allDetections]);

  const chartLog = log;
  const surveyPins: SurveyPin[] = useMemo(() => pinsFromLog(log), [log]);

  const latest = useMemo(() => {
    if (report?.detections.length) {
      return [...report.detections].sort((a, b) => b.confidence - a.confidence)[0];
    }
    return allDetections[0] ?? null;
  }, [report, allDetections]);

  const alerts = allDetections.filter((d) => confidenceBand(d.confidence) === "high").length;
  const ready = Boolean(health?.ok);
  const siteLive = health !== null;
  const hostedNoMl = Boolean(health?.hosted) && !ready;
  const go = (next: PageId) => {
    setPage(next);
    setNavOpen(false);
  };

  const pageTitle: Record<PageId, string> = {
    dashboard: "Operations overview",
    upload: "Upload sonar log",
    analysis: "Waterfall analysis",
    results: "Batch results",
    detections: "All detections",
    map: "Global detections map",
    report: "Cleanup report",
    history: "Survey history",
    settings: "Detector settings",
    about: "About Aqua Vision",
  };

  return (
    <div className="flex min-h-screen bg-transparent">
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-sidebar text-sidebar-foreground shadow-xl shadow-cyan-950/25 transition-transform lg:static lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-white/10 px-4 py-5">
          <BrandMark />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sky-100 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <div className={`flex items-center gap-2 text-xs ${ready ? "text-emerald-300" : siteLive ? "text-amber-200" : "text-red-300"}`}>
            <CheckCircle2 className="size-4" />
            {ready
              ? "System health: all systems operational"
              : hostedNoMl
                ? "Website live · YOLO not hosted here"
                : siteLive
                  ? "Website live · detector offline"
                  : "Cannot reach this website"}
          </div>
          <ShipGraphic />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-cyan-300 bg-white px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-900">{pageTitle[page]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill ok={siteLive && !busy} warn={hostedNoMl && !busy} label={`Site: ${busy ? "Scanning" : siteLive ? "Live" : "Down"}`} />
            <button type="button" className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={() => go("detections")}>
              <Bell className="size-4" />
              {alerts > 0 ? (
                <span className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {alerts > 9 ? "9+" : alerts}
                </span>
              ) : null}
            </button>
            <div className="grid size-8 place-items-center rounded-full bg-cyan-800 text-xs font-semibold text-white">
              <User className="size-4" />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">
          {page === "dashboard" && (
            <HomePage
              ready={ready}
              hostedNoMl={hostedNoMl}
              busy={busy}
              alerts={alerts}
              mapped={mapped}
              surveys={surveyPins}
              mixRows={mixRows}
              allDetections={allDetections}
              latest={latest}
              overlay={overlay}
              preview={preview}
              log={log}
              go={go}
              onPickOrigin={pickMapOrigin}
            />
          )}
          {page === "upload" && (
            <UploadPage
              threshold={threshold}
              setThreshold={setThreshold}
              busy={busy}
              file={file}
              meta={meta}
              setMeta={setMeta}
              batch={batch}
              queue={queue}
              onStage={(files) => {
                if (!files.length) return;
                setQueue((prev) => {
                  const map = new Map(prev.map((f) => [`${f.name}-${f.size}-${f.lastModified}`, f]));
                  for (const f of files) map.set(`${f.name}-${f.size}-${f.lastModified}`, f);
                  const next = Array.from(map.values()).slice(0, MAX_BATCH);
                  toast.message(`${next.length} file${next.length === 1 ? "" : "s"} ready — add more or tap Analyze`);
                  return next;
                });
              }}
              onClearQueue={() => setQueue([])}
              onStartQueue={() => void onFiles(queue)}
              onCancelBatch={() => {
                batchCancel.current = true;
                toast.message("Stopping after this image");
              }}
              onRerun={() => file && void onFiles([file])}
            />
          )}
          {page === "results" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Column charts and pies for this batch, plus the same hazard / confidence / class mix graphs used
                on the dashboard. Invalid colour photos never reach the detector.
              </p>
              <BatchResultsPanel run={batch} />
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Hazard, pie, confidence, latency</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These are the same live graphs as Home and Analysis. They fill from every valid sonar frame
                    in this batch (and earlier pings this session).
                  </p>
                </CardHeader>
                <CardContent>
                  <SurveyCharts
                    key={`results-charts-${chartLog.length}-${chartLog[0]?.id ?? "none"}`}
                    entries={chartLog}
                    defaultGraphs={["mix", "timeline", "confidence", "speed", "risk"]}
                    showLogTable={false}
                  />
                </CardContent>
              </Card>
            </div>
          )}
          {page === "analysis" && (
            <div className="space-y-4">
              <PipelineStrip
                active={pipeStep}
                complete={Boolean(report) && !busy}
                hint={busy ? "Processing sonar log" : report ? "Last ping fused and geotagged" : "Standing by"}
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <SonarTheater
                  preview={preview}
                  overlay={overlay}
                  busy={busy}
                  error={error}
                  report={report}
                  filename={file?.name}
                />
                <Card className="overflow-hidden shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Live map</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      One pin per uploaded image. Earlier uploads stay; the gold ring is the newest ping.
                    </p>
                  </CardHeader>
                  <CardContent className="relative h-[420px] p-0">
                    <SonarMap
                      key={`analysis-map-${surveyPins.length}-${surveyPins[0]?.id ?? "none"}`}
                      detections={mapped}
                      surveys={surveyPins}
                      onPickOrigin={pickMapOrigin}
                    />
                    <MapLegend count={surveyPins.length} />
                  </CardContent>
                </Card>
              </div>
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Session analytics</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These graphs include every image in this session, including the one you just uploaded.
                  </p>
                </CardHeader>
                <CardContent>
                  <SurveyCharts
                    key={`charts-${chartLog.length}-${chartLog[0]?.id ?? "none"}`}
                    entries={chartLog}
                    defaultGraphs={["mix", "timeline", "confidence", "speed", "risk"]}
                  />
                </CardContent>
              </Card>
            </div>
          )}
          {page === "detections" && (
            <DetectionsPage detections={allDetections} overlay={overlay} preview={preview} go={go} />
          )}
          {page === "map" && (
            <Card className="overflow-hidden shadow-sm">
              <CardHeader>
                <CardTitle>Global detections map</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Every class keeps its sonar photo on the pin — ghost net, propeller, tire, wreck, aircraft.
                  Click a pin to open that ping’s image at its latitude and longitude. Earlier uploads stay.
                </p>
              </CardHeader>
              <CardContent className="relative h-[620px] p-0">
                <SonarMap
                  key={`full-map-${surveyPins.length}-${surveyPins[0]?.id ?? "none"}`}
                  detections={mapped}
                  surveys={surveyPins}
                  onPickOrigin={pickMapOrigin}
                />
                <MapLegend count={surveyPins.length} />
              </CardContent>
            </Card>
          )}
          {page === "report" && (
            <ReportPage
              log={log}
              detections={allDetections}
              downloadJson={downloadJson}
              downloadCsv={downloadCsv}
              downloadBriefing={downloadBriefing}
              downloadPdf={downloadPdf}
            />
          )}
          {page === "history" && (
            <HistoryPage
              log={log}
              go={go}
              downloadJson={downloadJson}
              downloadCsv={downloadCsv}
              downloadBriefing={downloadBriefing}
              downloadPdf={downloadPdf}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              threshold={threshold}
              setThreshold={setThreshold}
              meta={meta}
              setMeta={setMeta}
              health={health}
              report={report}
            />
          )}
          {page === "about" && <AboutPage />}
        </main>

        <footer className="flex flex-col gap-1 bg-sidebar px-4 py-2 text-[11px] text-sky-100 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="font-heading font-bold text-white">Aqua Vision</span> v1.0.0
          </span>
          <span className="text-center">AI-Powered Underwater Debris &amp; Anomaly Detection using Side-Scan Sonar</span>
          <span>Last updated {clock ? `${clock} IST` : "—"}</span>
        </footer>
      </div>
    </div>
  );
}

function HomePage({
  ready,
  hostedNoMl,
  busy,
  alerts,
  mapped,
  surveys,
  mixRows,
  allDetections,
  latest,
  overlay,
  preview,
  log,
  go,
  onPickOrigin,
}: {
  ready: boolean;
  hostedNoMl: boolean;
  busy: boolean;
  alerts: number;
  mapped: Mapped[];
  surveys: SurveyPin[];
  mixRows: { class: string; count: number }[];
  allDetections: Mapped[];
  latest: Detection | null;
  overlay: string | null;
  preview: string | null;
  log: ScanLogEntry[];
  go: (p: PageId) => void;
  onPickOrigin?: (lat: number, lon: number) => void;
}) {
  const thumb = overlay ?? preview;
  const recent = allDetections.slice(0, 5);
  const bands = {
    low: allDetections.filter((d) => confidenceBand(d.confidence) === "low").length,
    medium: allDetections.filter((d) => confidenceBand(d.confidence) === "medium").length,
    high: allDetections.filter((d) => confidenceBand(d.confidence) === "high").length,
  };
  const bandTotal = Math.max(1, bands.low + bands.medium + bands.high);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="System Status"
          value={busy ? "Scanning" : ready || hostedNoMl ? "Live" : "Offline"}
          tone={ready || hostedNoMl ? "green" : "red"}
          icon={<Activity className="size-5" />}
        />
        <MetricCard
          title="Total Detections"
          value={String(allDetections.length)}
          tone="blue"
          icon={<Target className="size-5" />}
        />
        <MetricCard
          title="Surveys Completed"
          value={String(log.length)}
          tone="orange"
          icon={<Waves className="size-5" />}
        />
        <MetricCard
          title="Alerts"
          value={String(alerts)}
          hint="High confidence (>80%)"
          tone="red"
          icon={<TriangleAlert className="size-5" />}
        />
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Survey map</CardTitle>
          <p className="text-sm text-muted-foreground">
            Latest ping plus earlier finds. Click any pin — tire, net, propeller, wreck — to see that sonar photo.
          </p>
        </CardHeader>
        <CardContent className="relative h-[420px] p-0">
          <SonarMap
            key={`home-map-${surveys.length}-${surveys[0]?.id ?? "none"}`}
            detections={mapped}
            surveys={surveys}
            onPickOrigin={onPickOrigin}
          />
          <MapLegend count={surveys.length} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="shadow-sm xl:col-span-6">
          <CardHeader className="pb-1">
            <CardTitle className="text-base">Debris pie chart</CardTitle>
            <p className="text-sm text-muted-foreground">Class mix across every uploaded sonar image.</p>
          </CardHeader>
          <CardContent>
            {mixRows.length === 0 ? (
              <EmptyNote text="No detections yet. Upload a sonar image to run the detector." />
            ) : (
              <ClassMixPie rows={mixRows} height={280} />
            )}
          </CardContent>
        </Card>
        <Card className="border-cyan-800 bg-[#0c4a6e] text-cyan-50 shadow-sm xl:col-span-3">
          <CardHeader className="pb-1">
            <CardTitle className="text-base text-cyan-50">Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allDetections.length === 0 ? (
              <p className="rounded-lg bg-cyan-950/40 px-3 py-8 text-center text-sm text-cyan-200">
                Confidence bands appear after the first fused scan.
              </p>
            ) : (
              <>
                <StackedBand label="High (>80%)" count={bands.high} color="#fb7185" share={bands.high / bandTotal} dark />
                <StackedBand label="Medium (50–80%)" count={bands.medium} color="#fbbf24" share={bands.medium / bandTotal} dark />
                <StackedBand label="Low (<50%)" count={bands.low} color="#22d3ee" share={bands.low / bandTotal} dark />
              </>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!latest ? (
              <EmptyNote text="Waiting for the first contact." />
            ) : (
              <>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="Latest detection" className="h-40 w-full rounded-lg object-cover" />
                ) : (
                  <div className="grid h-40 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">
                    No image
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Class</dt>
                    <dd className="font-medium">{CLASS_LABEL[latest.class] ?? latest.class}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Confidence</dt>
                    <dd className="font-medium" style={{ color: confidenceColor(latest.confidence) }}>
                      {(latest.confidence / 100).toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Latitude</dt>
                    <dd className="font-mono">{latest.latitude?.toFixed(5) ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Longitude</dt>
                    <dd className="font-mono">{latest.longitude?.toFixed(5) ?? "—"}</dd>
                  </div>
                </dl>
                <Button className="w-full" onClick={() => go("analysis")}>
                  View Details
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Live survey graphs</CardTitle>
          <p className="text-sm text-muted-foreground">
            Counts and hazard scores refresh as soon as a sonar file is processed.
          </p>
        </CardHeader>
        <CardContent>
          <SurveyCharts
            key={`home-charts-${log.length}-${log[0]?.id ?? "none"}`}
            entries={log}
            defaultGraphs={["mix", "timeline", "confidence", "speed", "risk"]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => go("history")}>
              View All History
            </Button>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <EmptyNote text="Survey history is empty until a ping is processed." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Date &amp; Time</TableHead>
                      <TableHead>Detections</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.slice(0, 6).map((e, i) => {
                      const high = e.detections.some((d) => confidenceBand(d.confidence) === "high");
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-xs">#{1000 + (log.length - i)}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs">{e.filename}</TableCell>
                          <TableCell className="font-mono text-[11px]">{formatIst(e.at)}</TableCell>
                          <TableCell>{e.count}</TableCell>
                          <TableCell>
                            <Badge className={high ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}>
                              {high ? "High Alert" : "Completed"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <button type="button" className="text-slate-500 hover:text-cyan-700" onClick={() => go("analysis")}>
                              <Eye className="size-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Detections</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => go("detections")}>
              View All Detections
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyNote text="Top contacts will appear here after inference." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {recent.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => go("analysis")}
                    className="overflow-hidden rounded-xl border border-cyan-200 bg-white text-left hover:border-cyan-600"
                  >
                    {d.overlay_url || d.image_url || thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.overlay_url || d.image_url || thumb || ""} alt="" className="h-20 w-full object-cover" />
                    ) : (
                      <div className="h-20 bg-slate-100" />
                    )}
                    <div className="space-y-0.5 p-2">
                      <p className="truncate text-xs font-semibold">{CLASS_LABEL[d.class] ?? d.class}</p>
                      <p className="text-[11px] font-medium" style={{ color: confidenceColor(d.confidence) }}>
                        {d.confidence.toFixed(0)}%
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">
                        {d.latitude != null && d.longitude != null
                          ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`
                          : "Ungeotagged"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UploadPage({
  threshold,
  setThreshold,
  busy,
  file,
  meta,
  setMeta,
  batch,
  queue,
  onStage,
  onClearQueue,
  onStartQueue,
  onCancelBatch,
  onRerun,
}: {
  threshold: number;
  setThreshold: (n: number) => void;
  busy: boolean;
  file: File | null;
  meta: MetaForm;
  setMeta: (m: MetaForm) => void;
  batch: BatchRun | null;
  queue: File[];
  onStage: (files: File[]) => void;
  onClearQueue: () => void;
  onStartQueue: () => void;
  onCancelBatch: () => void;
  onRerun: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const manyRef = useRef<HTMLInputElement>(null);
  const take = (list: FileList | File[] | null) => {
    if (!list) return;
    onStage(Array.from(list));
  };

  const pickManyWithSystemDialog = async () => {
    const w = window as Window & {
      showOpenFilePicker?: (opts: {
        multiple: boolean;
        excludeAcceptAllOption?: boolean;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<Array<{ getFile: () => Promise<File> }>>;
    };
    try {
      if (typeof w.showOpenFilePicker === "function") {
        const handles = await w.showOpenFilePicker({
          multiple: true,
          excludeAcceptAllOption: false,
          types: [
            {
              description: "Sonar / image files",
              accept: {
                "image/jpeg": [".jpg", ".jpeg"],
                "image/png": [".png"],
                "image/webp": [".webp"],
                "image/tiff": [".tif", ".tiff"],
              },
            },
          ],
        });
        take(await Promise.all(handles.map((h) => h.getFile())));
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    manyRef.current?.click();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,380px)_1fr]">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Add sonar files</CardTitle>
          <p className="text-sm text-muted-foreground">
            One file window, many files: Ctrl+click or Shift+click only the sonar frames you want. You can tap
            Add files again to append 20, then 30, then 50. Analyze runs once for the whole list.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={manyRef}
            type="file"
            multiple
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-800 file:px-3 file:py-2 file:text-white"
            disabled={busy}
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />

          <Button className="h-12 w-full text-base" disabled={busy} onClick={() => void pickManyWithSystemDialog()}>
            <Images />
            Add files (select many)
          </Button>
          <a
            href="/aqua-vision-check-kit.zip"
            download
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-700 bg-white text-sm font-medium text-cyan-900 hover:bg-cyan-50"
          >
            <Download className="size-4" />
            Download 30 valid + 5 invalid test images
          </a>
          <p className="text-xs text-slate-600">
            In the file window hold <strong>Ctrl</strong> (Windows) or <strong>Cmd</strong> (Mac) and click each
            sonar image, or click the first then <strong>Shift+click</strong> the last. Do not use the phone
            Camera roll. Drop files below also works. Then tap Analyze once.
          </p>

          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              take(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm ${
              dragging ? "border-cyan-700 bg-cyan-50" : "border-cyan-300 bg-slate-50 text-slate-600"
            }`}
          >
            Or drop several image files here (not a mixed dump of every file on the disk).
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              queue.length >= 100
                ? "border border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-semibold">{queue.length} files ready</p>
            <p className="text-xs">
              Add files as many times as you want. Nothing is analyzed until you tap Analyze.
            </p>
          </div>

          <Button
            className="h-11 w-full text-base"
            disabled={busy || queue.length === 0}
            onClick={onStartQueue}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Analyze ({queue.length})
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={busy || queue.length === 0} onClick={onClearQueue}>
            Clear queue
          </Button>
          {busy && batch ? (
            <Button type="button" variant="outline" className="w-full" onClick={onCancelBatch}>
              Stop after in-flight images
            </Button>
          ) : null}
          {batch ? (
            <div className="space-y-1 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-950">
              <p className="font-medium">
                {batch.finished
                  ? "Done — open Batch results"
                  : `${batch.done} of ${batch.total} · ${batch.phase === "validate" ? "checking files" : "analyzing"}`}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-cyan-100">
                <div
                  className="h-full bg-cyan-700 transition-all"
                  style={{ width: `${batch.total ? (100 * batch.done) / batch.total : 0}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-cyan-800">
                {batch.current || `${batch.rows.length} scored`} · {(batch.elapsedMs / 1000).toFixed(1)} s
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => applyDeviceGps(setMeta, meta)}
          >
            Use live device GPS
          </Button>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
              <span>Confidence gate</span>
              <span className="font-mono text-cyan-800">{threshold}%</span>
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
          <Button variant="outline" className="w-full" disabled={!file || busy} onClick={onRerun}>
            {busy ? <Loader2 className="animate-spin" /> : <Waves />}
            Re-run last image at {threshold}%
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["latitude", "Latitude"],
                ["longitude", "Longitude"],
                ["heading_deg", "Heading °"],
                ["meters_per_pixel_x", "m / px across"],
                ["meters_per_pixel_y", "m / px along"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-slate-600">
                {label}
                <Input
                  value={meta[key]}
                  placeholder="optional — or click map"
                  onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                  className="h-8"
                />
              </label>
            ))}
            <label className="col-span-2 space-y-1 text-xs text-slate-600">
              Survey name
              <Input value={meta.survey} onChange={(e) => setMeta({ ...meta, survey: e.target.value })} className="h-8" />
            </label>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Queued sonar frames</CardTitle>
          <p className="text-sm text-muted-foreground">
            These files are held on this preview copy only. Nothing is written to the live judge website.
          </p>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="text-sm text-slate-500">
              No files yet. Tap Add files, Ctrl+click the sonar images you want, Open, then Analyze.
            </p>
          ) : (
            <ul className="max-h-[480px] space-y-1 overflow-auto text-xs">
              {queue.slice(0, 120).map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`} className="truncate font-mono text-slate-700">
                  {i + 1}. {f.name}
                </li>
              ))}
              {queue.length > 120 ? (
                <li className="text-slate-500">…and {queue.length - 120} more</li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetectionsPage({
  detections,
  overlay,
  preview,
  go,
}: {
  detections: Mapped[];
  overlay: string | null;
  preview: string | null;
  go: (p: PageId) => void;
}) {
  const thumb = overlay ?? preview;
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Detections</CardTitle>
        <p className="text-sm text-muted-foreground">{detections.length} contacts across logged surveys.</p>
      </CardHeader>
      <CardContent>
        {detections.length === 0 ? (
          <EmptyNote text="No detections logged yet." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Class</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Hazard</TableHead>
                  <TableHead>Lat / Lon</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {detections.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="size-10 rounded object-cover" />
                      ) : (
                        <span
                          className="inline-block size-3 rounded-full"
                          style={{ background: CLASS_COLOR[d.class] }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{CLASS_LABEL[d.class] ?? d.class}</TableCell>
                    <TableCell style={{ color: confidenceColor(d.confidence) }}>{d.confidence.toFixed(0)}%</TableCell>
                    <TableCell>{d.hazard_score}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.latitude != null && d.longitude != null
                        ? `${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">{d.source ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => go("analysis")}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DownloadMenu({
  disabled,
  downloadJson,
  downloadCsv,
  downloadBriefing,
  downloadPdf,
}: {
  disabled: boolean;
  downloadJson: () => void;
  downloadCsv: () => void;
  downloadBriefing: () => void;
  downloadPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Download />
        Download
        <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {(
            [
              ["CSV", downloadCsv],
              ["JSON", downloadJson],
              ["Briefing", downloadBriefing],
              ["PDF", downloadPdf],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                fn();
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportPage({
  log,
  detections,
  downloadJson,
  downloadCsv,
  downloadBriefing,
  downloadPdf,
}: {
  log: ScanLogEntry[];
  detections: Mapped[];
  downloadJson: () => void;
  downloadCsv: () => void;
  downloadBriefing: () => void;
  downloadPdf: () => void;
}) {
  const hasData = log.length > 0;
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Cleanup report</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {log.length} image{log.length === 1 ? "" : "s"} · {detections.length} contact
              {detections.length === 1 ? "" : "s"} — updates with every upload.
            </p>
          </div>
          <DownloadMenu
            disabled={!hasData}
            downloadJson={downloadJson}
            downloadCsv={downloadCsv}
            downloadBriefing={downloadBriefing}
            downloadPdf={downloadPdf}
          />
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <EmptyNote text="Upload a sonar image. Each file is appended here immediately." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When (IST)</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Hits</TableHead>
                    <TableHead>Lat / Lon</TableHead>
                    <TableHead>ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((e) => {
                    const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{formatIst(e.at)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs">{e.filename}</TableCell>
                        <TableCell className="text-xs">
                          {top ? CLASS_LABEL[top.class] ?? top.class : "No detection"}
                        </TableCell>
                        <TableCell className="font-medium">{e.count}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.latitude != null && e.longitude != null
                            ? `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.inference_ms}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {detections.length === 0 ? (
            <EmptyNote text="Logged images with no class above the gate still appear in the table above." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Conf.</TableHead>
                    <TableHead>Hazard</TableHead>
                    <TableHead>Lat / Lon</TableHead>
                    <TableHead>Size (m)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detections.map((d) => (
                    <TableRow key={`${d.source}-${d.id}`}>
                      <TableCell className="max-w-[180px] truncate text-xs">{d.source ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: CLASS_COLOR[d.class] }} />
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
    </div>
  );
}

function HistoryPage({
  log,
  go,
  downloadJson,
  downloadCsv,
  downloadBriefing,
  downloadPdf,
}: {
  log: ScanLogEntry[];
  go: (p: PageId) => void;
  downloadJson: () => void;
  downloadCsv: () => void;
  downloadBriefing: () => void;
  downloadPdf: () => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Survey history</CardTitle>
        <DownloadMenu
          disabled={log.length === 0}
          downloadJson={downloadJson}
          downloadCsv={downloadCsv}
          downloadBriefing={downloadBriefing}
          downloadPdf={downloadPdf}
        />
      </CardHeader>
      <CardContent>
        {log.length === 0 ? (
          <EmptyNote text="No surveys completed yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (IST)</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead>ms</TableHead>
                <TableHead>Survey</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{formatIst(e.at)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">{e.filename}</TableCell>
                  <TableCell>{e.count}</TableCell>
                  <TableCell className="font-mono text-xs">{e.inference_ms}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{e.survey}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => go("analysis")}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPage({
  threshold,
  setThreshold,
  meta,
  setMeta,
  health,
  report,
}: {
  threshold: number;
  setThreshold: (n: number) => void;
  meta: MetaForm;
  setMeta: (m: MetaForm) => void;
  health: { ok: boolean; hosted?: boolean; trained?: boolean; weights?: string; error?: string } | null;
  report: DetectReport | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Inference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {health?.ok
              ? `Detector online${health.weights ? ` · ${health.weights}` : ""}`
              : health?.hosted
                ? "This public website is live. YOLO inference is not deployed on Vercel — run `npm run dev:all` locally to score uploads."
                : `Detector offline${health?.error ? ` · ${health.error}` : ""}`}
          </p>
          <div>
            <div className="mb-2 flex justify-between text-xs">
              <span>Confidence gate</span>
              <span className="font-mono">{threshold}%</span>
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
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["latitude", "Latitude"],
                ["longitude", "Longitude"],
                ["heading_deg", "Heading °"],
                ["meters_per_pixel_x", "m / px across"],
                ["meters_per_pixel_y", "m / px along"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-slate-600">
                {label}
                <Input
                  value={meta[key]}
                  placeholder="optional — or click map"
                  onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
                  className="h-8"
                />
              </label>
            ))}
            <label className="col-span-2 space-y-1 text-xs text-slate-600">
              Survey name
              <Input value={meta.survey} onChange={(e) => setMeta({ ...meta, survey: e.target.value })} className="h-8" />
            </label>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["mAP@50", MODEL_METRICS.map50, "Held-out sonar validation"],
          ["Precision", MODEL_METRICS.precision, "Real SSS and FLS imagery"],
          ["Recall", MODEL_METRICS.recall, "After shadow fusion"],
          ["Train / val", `${MODEL_METRICS.trainImages} / ${MODEL_METRICS.valImages}`, "Public labelled pings"],
          ["Architecture", MODEL_METRICS.model, `${MODEL_METRICS.params} · ${MODEL_METRICS.imgsz} px`],
          ["Runtime", MODEL_METRICS.device, report ? `${report.inference_ms} ms this ping` : "Edge nano"],
        ].map(([k, v, d]) => (
          <Card key={k} className="shadow-sm">
            <CardContent className="pt-5">
              <p className="font-mono text-[10px] tracking-widest text-cyan-800 uppercase">{k}</p>
              <p className="font-heading mt-1 text-2xl font-semibold">{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{d}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <BrandMark onDark={false} size="hero" />
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            Aqua Vision is an operations console for {MODEL_METRICS.org} problem {MODEL_METRICS.problem}: detect ghost gear,
            wrecks, and man-made debris in side-scan sonar and issue geotagged cleanup reports.
          </p>
          <p>
            Each sonar image is scored as soon as it arrives (live YOLO11n, {MODEL_METRICS.params}). Confidence
            fuses the box score with contrast and an acoustic-shadow penalty. Latitude/longitude are taken only from
            ping metadata, JPEG EXIF, or an origin the operator sets — never a dummy map location.
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>1. Lee speckle filter and dropout inpaint</p>
          <p>2. CLAHE contrast restore</p>
          <p>3. YOLO11n detection</p>
          <p>4. Contrast × acoustic-shadow fusion</p>
          <p>5. Geotag and cleanup report (JSON / CSV / HTML)</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  tone,
  icon,
}: {
  title: string;
  value: string;
  hint?: string;
  tone: "green" | "purple" | "blue" | "orange" | "red";
  icon: React.ReactNode;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    purple: "bg-violet-50 text-violet-700",
    blue: "bg-cyan-100 text-cyan-900",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 pt-5">
        <div>
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : warn
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {ok ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
      {label}
    </span>
  );
}

function MapLegend({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-[1000] rounded-md bg-white/95 px-2 py-1.5 text-[11px] text-slate-700 shadow">
      <div className="mb-1 font-medium">
        {count ? `${count} image${count === 1 ? "" : "s"} · 1 pin each` : "Upload a sonar image to plot"}
      </div>
      <div className="mb-1 flex gap-2">
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full ring-2 ring-amber-400 bg-cyan-700" /> Latest
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-slate-400" /> Earlier
        </span>
      </div>
      <div className="flex gap-2">
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-red-500" /> High
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-orange-500" /> Medium
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-green-500" /> Low
        </span>
      </div>
    </div>
  );
}

function StackedBand({
  label,
  count,
  color,
  share,
  dark,
}: {
  label: string;
  count: number;
  color: string;
  share: number;
  dark?: boolean;
}) {
  return (
    <div>
      <div className={`mb-1 flex justify-between text-xs ${dark ? "text-cyan-100" : "text-slate-600"}`}>
        <span>{label}</span>
        <span className="font-mono">{count}</span>
      </div>
      <div className={`h-2.5 overflow-hidden rounded-full ${dark ? "bg-cyan-950/70" : "bg-slate-100"}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">{text}</p>;
}

function ShipGraphic() {
  return (
    <svg viewBox="0 0 220 88" className="mt-3 w-full opacity-80" aria-hidden>
      <rect x="0" y="48" width="220" height="40" fill="#67e8f9" />
      <path d="M0 62 Q55 48 110 62 T220 62 V88 H0 Z" fill="#2dd4bf" />
      <path d="M48 40 L168 40 L158 52 L58 52 Z" fill="#5eead4" />
      <rect x="92" y="22" width="36" height="18" rx="2" fill="#ccfbf1" />
      <rect x="104" y="10" width="10" height="14" fill="#0d9488" />
      <path d="M110 52 L110 78" stroke="#ecfeff" strokeWidth="2" />
      <path d="M90 78 Q110 70 130 78" fill="none" stroke="#ecfeff" strokeWidth="1.5" opacity="0.9" />
      <path d="M70 82 Q110 68 150 82" fill="none" stroke="#ecfeff" strokeWidth="1" opacity="0.6" />
      <circle cx="78" cy="80" r="3" fill="#f97316" />
      <circle cx="128" cy="76" r="3" fill="#ef4444" />
      <circle cx="152" cy="82" r="3" fill="#22c55e" />
    </svg>
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
