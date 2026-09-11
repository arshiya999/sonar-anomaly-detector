"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { confidenceColor } from "@/lib/labels";
import type { Detection, SurveyPin } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type Mapped = Detection & { source?: string };

function FitPins({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    try {
      if (map.getSize().x < 8) return;
      map.invalidateSize();
      if (points.length === 0) {
        map.setView([13.0827, 80.2707], 8);
        return;
      }
      if (points.length === 1) map.setView(points[0], 13);
      else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14 });
    } catch {
      /* unmounted */
    }
  }, [map, key, points]);
  return null;
}

function ResizeGuard() {
  const map = useMap();
  useEffect(() => {
    const kick = () => {
      try {
        if (map.getSize().x > 0) map.invalidateSize();
      } catch {
        /* unmounted */
      }
    };
    const t = window.setTimeout(kick, 80);
    window.addEventListener("resize", kick);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", kick);
    };
  }, [map]);
  return null;
}

function PinPane() {
  const map = useMap();
  if (!map.getPane("pins")) {
    const pane = map.createPane("pins");
    pane.style.zIndex = "650";
    pane.style.pointerEvents = "auto";
  }
  return null;
}

function MapClickOrigin({ onPickOrigin }: { onPickOrigin?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPickOrigin?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function SonarMap({
  surveys = [],
  basemap = "world",
  onPickOrigin,
}: {
  /** Kept so older call sites compile; pins come from surveys only (one image → one pin). */
  detections?: Mapped[];
  surveys?: SurveyPin[];
  basemap?: "world" | "imagery";
  onPickOrigin?: (lat: number, lon: number) => void;
}) {
  const points = useMemo(
    () => surveys.map((s) => [s.latitude, s.longitude] as [number, number]),
    [surveys],
  );
  const center = points[0] ?? ([13.0827, 80.2707] as [number, number]);
  const zoom = points.length ? 13 : 8;

  return (
    <MapContainer center={center} zoom={zoom} className="h-full min-h-[280px] w-full" scrollWheelZoom>
      {basemap === "imagery" ? (
        <TileLayer
          attribution="Tiles © Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      ) : (
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      )}
      <ResizeGuard />
      <PinPane />
      <MapClickOrigin onPickOrigin={onPickOrigin} />
      <FitPins points={points} />
      {surveys.map((s) => (
        <CircleMarker
          key={`${s.id}-survey`}
          pane="pins"
          center={[s.latitude, s.longitude]}
          radius={s.latest ? 16 : 10}
          pathOptions={{
            color: s.latest ? "#fbbf24" : "#ffffff",
            fillColor: s.latest ? "#2563eb" : s.classId ? confidenceColor(s.confidence ?? 55) : "#64748b",
            fillOpacity: s.latest ? 1 : 0.72,
            weight: s.latest ? 4 : 2,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, s.latest ? -14 : -10]} className="sonar-material-label">
            {s.latest ? `Latest · ${s.material}` : `Earlier · ${s.material}`}
          </Tooltip>
          <Popup>
            <div className="max-w-[240px] text-sm text-slate-900">
              <p className="text-[10px] font-semibold tracking-wide text-blue-700 uppercase">
                {s.latest ? "Latest ping (this upload)" : "Earlier ping (previous upload)"}
              </p>
              <p className="font-semibold">{s.material}</p>
              <p className="text-xs text-slate-600">One pin per image · {s.filename}</p>
              {s.contactSummary ? <p className="text-xs">In this file: {s.contactSummary}</p> : null}
              {s.hitCount != null ? <p className="text-xs">{s.hitCount} box{s.hitCount === 1 ? "" : "es"} in the waterfall</p> : null}
              <p className="font-mono text-[11px]">
                {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
              </p>
              {s.confidence != null ? <p className="text-xs">{s.confidence.toFixed(0)}% confidence</p> : null}
              {s.overlay_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.overlay_url} alt={s.material} className="mt-2 max-h-40 w-full rounded object-cover" />
              ) : null}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
