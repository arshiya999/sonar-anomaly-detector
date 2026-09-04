import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Empty, fmt } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";

type Frame = {
  id: string;
  seq: number;
  ping_number: number | null;
  timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  depth: number | null;
  altitude: number | null;
  range_m: number | null;
  quality_score: number | null;
  gps_available: boolean;
  motion_compensation: string;
  image_url: string | null;
  overlay_url: string | null;
  detections: number;
};

export default function LivePage() {
  const [sonar, setSonar] = useState<{ connected: boolean; state: string; detail: string; error: string | null } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("9100");
  const [dir, setDir] = useState("");
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [zoom, setZoom] = useState(100);
  const [paused, setPaused] = useState(false);

  const refresh = () => {
    api<{ connected: boolean; state: string; detail: string; error: string | null }>("/api/sonar/status").then(setSonar).catch(() => undefined);
    api<{ frame: Frame | null }>("/api/frames/latest").then((r) => setFrame(r.frame)).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/sonar`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "frame") setFrame(msg as Frame);
    };
    return () => {
      clearInterval(id);
      ws.close();
    };
  }, []);

  const connected = sonar?.connected;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!connected} onClick={() => api("/api/surveys/start", { method: "POST" }).then(refresh)}>
          Start Survey
        </Button>
        <Button size="sm" variant="outline" onClick={() => api("/api/surveys/stop", { method: "POST" }).then(refresh)}>
          Stop Survey
        </Button>
        <Button size="sm" variant="outline" disabled={!connected} onClick={() => api("/api/sonar/pause", { method: "POST" }).then(() => setPaused(true))}>
          Pause
        </Button>
        <Button size="sm" variant="outline" disabled={!connected} onClick={() => api("/api/sonar/resume", { method: "POST" }).then(() => setPaused(false))}>
          Resume
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!frame?.overlay_url && !frame?.image_url}
          onClick={() => {
            const url = frame?.overlay_url || frame?.image_url;
            if (url) {
              const a = document.createElement("a");
              a.href = url;
              a.download = `capture-${frame?.id}.jpg`;
              a.click();
            }
          }}
        >
          Capture Frame
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card title="Live Sonar Feed">
          {!connected ? (
            <div className="grid min-h-[420px] place-items-center rounded-lg bg-[#0b1c33] text-center text-slate-200">
              <div>
                <p className="text-lg font-semibold tracking-widest">SONAR DISCONNECTED</p>
                <p className="mt-2 max-w-md text-sm text-slate-400">
                  No live frames. Connect a TCP JSON-line source or a directory that a real logger writes into. Fake frames are not generated.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg bg-black">
              {frame?.overlay_url || frame?.image_url ? (
                <img
                  src={frame.overlay_url || frame.image_url || ""}
                  alt="live sonar"
                  className="max-h-[520px] w-full object-contain"
                  style={{
                    filter: `brightness(${bright / 100}) contrast(${contrast / 100})`,
                    transform: `scale(${zoom / 100})`,
                  }}
                />
              ) : (
                <Empty text="Connected — waiting for the first real frame" />
              )}
            </div>
          )}
        </Card>
        <div className="space-y-3">
          <Card title="Connect real source">
            <div className="space-y-2 text-xs">
              <p className="text-slate-500">TCP (JSON lines with image_b64 or path)</p>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" />
              <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" />
              <Button
                className="w-full"
                onClick={() =>
                  api("/api/sonar/connect", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ source_type: "tcp", host, port: Number(port) }),
                  })
                    .then(() => toast.success("Connecting"))
                    .catch((e) => toast.error(String(e)))
                    .finally(refresh)
                }
              >
                Connect TCP
              </Button>
              <p className="pt-2 text-slate-500">Directory ingest of arriving PNG/JPG/TIF</p>
              <Input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/path/to/incoming" />
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  api("/api/sonar/connect", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ source_type: "directory", path: dir }),
                  })
                    .then(() => toast.success("Watching directory"))
                    .catch((e) => toast.error(String(e)))
                    .finally(refresh)
                }
              >
                Connect directory
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => api("/api/sonar/disconnect", { method: "POST" }).then(refresh)}>
                Disconnect
              </Button>
              {sonar?.error ? <p className="text-red-600">{sonar.error}</p> : null}
              <p className="text-slate-500">{sonar?.detail}</p>
            </div>
          </Card>
          <Card title="Ping metadata">
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">Frame</dt>
              <dd>{fmt(frame?.id)}</dd>
              <dt className="text-slate-500">Ping</dt>
              <dd>{fmt(frame?.ping_number)}</dd>
              <dt className="text-slate-500">Timestamp</dt>
              <dd>{fmt(frame?.timestamp)}</dd>
              <dt className="text-slate-500">Latitude</dt>
              <dd>{frame?.latitude == null ? "GPS unavailable" : frame.latitude}</dd>
              <dt className="text-slate-500">Longitude</dt>
              <dd>{frame?.longitude == null ? "GPS unavailable" : frame.longitude}</dd>
              <dt className="text-slate-500">Depth</dt>
              <dd>{fmt(frame?.depth)}</dd>
              <dt className="text-slate-500">Altitude</dt>
              <dd>{fmt(frame?.altitude)}</dd>
              <dt className="text-slate-500">Heading</dt>
              <dd>{fmt(frame?.heading)}</dd>
              <dt className="text-slate-500">Range</dt>
              <dd>{fmt(frame?.range_m)}</dd>
              <dt className="text-slate-500">Motion</dt>
              <dd>{frame?.motion_compensation === "unavailable" ? "Motion compensation unavailable" : fmt(frame?.motion_compensation)}</dd>
            </dl>
          </Card>
          <Card title="Display">
            <p className="text-xs text-slate-500">Zoom {zoom}%</p>
            <Slider min={50} max={200} value={[zoom]} onValueChange={(v) => setZoom(Number(Array.isArray(v) ? v[0] : v))} />
            <p className="mt-2 text-xs text-slate-500">Brightness {bright}%</p>
            <Slider min={40} max={160} value={[bright]} onValueChange={(v) => setBright(Number(Array.isArray(v) ? v[0] : v))} />
            <p className="mt-2 text-xs text-slate-500">Contrast {contrast}%</p>
            <Slider min={40} max={180} value={[contrast]} onValueChange={(v) => setContrast(Number(Array.isArray(v) ? v[0] : v))} />
            {paused ? <p className="mt-2 text-xs text-orange-600">Paused</p> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
