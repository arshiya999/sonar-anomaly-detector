import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Bell,
  Cpu,
  History,
  Info,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Radio,
  ScanLine,
  Settings,
  FileSpreadsheet,
  Target,
  Upload,
  User,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import type { SystemStatus } from "@/lib/types";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live Sonar", icon: Radio },
  { to: "/upload", label: "Upload Survey", icon: Upload },
  { to: "/analysis", label: "Analysis", icon: ScanLine },
  { to: "/detections", label: "Detections", icon: Target },
  { to: "/map", label: "Map", icon: MapIcon },
  { to: "/reports", label: "Reports", icon: FileSpreadsheet },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [alerts, setAlerts] = useState(0);

  useEffect(() => {
    const load = () =>
      api<SystemStatus>("/api/system/status")
        .then((s) => {
          setStatus(s);
          setAlerts(s.unread_alerts);
        })
        .catch(() =>
          setStatus((prev) =>
            prev ?? {
              system: "error",
              sonar: "disconnected",
              sonar_detail: "Backend unreachable",
              model: "not_loaded",
              model_info: {
                loaded: false,
                exists: false,
                name: null,
                classes: [],
                task: "unknown",
                device: "cpu",
                error: "backend unreachable",
                path: "",
              },
              total_detections: 0,
              unread_alerts: 0,
              high_confidence_alerts: 0,
              current_survey: null,
              problem: "SIH26057",
              organization: "Ministry of Earth Sciences (MoES)",
              department: "National Institute of Ocean Technology (NIOT)",
              health: "degraded",
              clock: "",
            },
          ),
        );
    load();
    const id = setInterval(load, 4000);
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/alerts`);
    ws.onmessage = () => setAlerts((n) => n + 1);
    return () => {
      clearInterval(id);
      ws.close();
    };
  }, []);

  const systemLabel =
    status?.system === "processing" ? "Processing" : status?.system === "error" ? "Error" : "Ready";
  const sonarLabel =
    status?.sonar === "connected" ? "Connected" : status?.sonar === "paused" ? "Paused" : "Disconnected";
  const modelLabel = status?.model === "loaded" ? "Ready" : "Not Loaded";

  return (
    <div className="flex min-h-screen bg-[#eef1f6]">
      {open ? (
        <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-[#0b1c33] text-slate-100 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-lg font-semibold tracking-[0.14em] text-white uppercase">Aqua Vision</p>
          <p className="mt-1 text-[11px] tracking-wide text-slate-400">Side-Scan Sonar Intelligence</p>
          <p className="mt-2 text-[10px] text-slate-500">SIH26057 · MoES / NIOT</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-[#2563eb] text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="size-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-xs">
          <p className="mb-1 text-slate-400">System Health</p>
          <p className={status?.health === "operational" ? "text-emerald-300" : "text-red-300"}>
            ● {status?.health === "operational" ? "All systems operational" : "Degraded / backend error"}
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" className="rounded-md p-1.5 lg:hidden" onClick={() => setOpen(true)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Pill ok={status?.system === "ready"} warn={status?.system === "processing"} label={`System: ${systemLabel}`} />
            <Pill ok={status?.sonar === "connected"} label={`Sonar: ${sonarLabel}`} />
            <Pill ok={status?.model === "loaded"} icon={<Cpu className="size-3.5" />} label={`AI Model: ${modelLabel}`} purple />
            <span className="relative rounded-full p-2 text-slate-500">
              <Bell className="size-4" />
              {alerts > 0 ? (
                <span className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {alerts > 9 ? "9+" : alerts}
                </span>
              ) : null}
            </span>
            <div className="grid size-8 place-items-center rounded-full bg-slate-800 text-white">
              <User className="size-4" />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6">
          <Outlet context={{ status }} />
        </main>
        <footer className="flex flex-col gap-1 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Aqua Vision v1.0.0</span>
          <span className="text-center">AI-Powered Underwater Debris &amp; Anomaly Detection using Side-Scan Sonar</span>
          <span>SIH26057 · {status?.clock ? status.clock.replace("T", " ").slice(0, 19) + " UTC" : "—"}</span>
        </footer>
      </div>
      <Toaster />
    </div>
  );
}

function Pill({
  ok,
  warn,
  label,
  purple,
  icon,
}: {
  ok?: boolean;
  warn?: boolean;
  label: string;
  purple?: boolean;
  icon?: ReactNode;
}) {
  const cls = warn
    ? "border-orange-200 bg-orange-50 text-orange-800"
    : ok
      ? purple
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${cls}`}>
      {icon ?? <Activity className="size-3.5" />}
      {label}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{text}</p>;
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function fmt(v: unknown, fallback = "Unavailable"): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}
