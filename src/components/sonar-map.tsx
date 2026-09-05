"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, ImageOverlay, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { CLASS_LABEL, confidenceColor } from "@/lib/labels";
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
        map.setView([15, 75], 3);
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

function overlayBounds(lat: number, lon: number): L.LatLngBoundsExpression {
  const dlat = 0.006;
  const dlon = 0.006 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [
    [lat - dlat, lon - dlon],
    [lat + dlat, lon + dlon],
  ];
}

export function SonarMap({
  detections,
  surveys = [],
  basemap = "world",
}: {
  detections: Mapped[];
  surveys?: SurveyPin[];
  basemap?: "world" | "imagery";
}) {
  const points = useMemo(() => {
    const fromDet = detections
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => [d.latitude as number, d.longitude as number] as [number, number]);
    const fromSurvey = surveys.map((s) => [s.latitude, s.longitude] as [number, number]);
    return [...fromSurvey, ...fromDet];
  }, [detections, surveys]);
  const sonarFrames = useMemo(() => {
    const seen = new Set<string>();
    const frames: { id: string; lat: number; lon: number; url: string }[] = [];
    for (const s of surveys) {
      if (!s.overlay_url) continue;
      const key = s.overlay_url;
      if (seen.has(key)) continue;
      seen.add(key);
      frames.push({ id: s.id, lat: s.latitude, lon: s.longitude, url: s.overlay_url });
    }
    for (const d of detections) {
      if (d.latitude == null || d.longitude == null || !d.overlay_url) continue;
      if (seen.has(d.overlay_url)) continue;
      seen.add(d.overlay_url);
      frames.push({ id: d.id, lat: d.latitude, lon: d.longitude, url: d.overlay_url });
    }
    return frames;
  }, [detections, surveys]);
  const center = points[0] ?? ([15, 75] as [number, number]);
  const zoom = points.length ? 13 : 3;

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
      <FitPins points={points} />
      {sonarFrames.map((f) => (
        <ImageOverlay key={`${f.id}-img`} url={f.url} bounds={overlayBounds(f.lat, f.lon)} opacity={0.88} />
      ))}
      {surveys.map((s) => (
        <CircleMarker
          key={`${s.id}-survey`}
          center={[s.latitude, s.longitude]}
          radius={10}
          pathOptions={{ color: "#1d4ed8", fillColor: "#2563eb", fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="max-w-[220px] text-sm text-slate-900">
              <strong>{s.filename}</strong>
              <br />
              {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
              {s.overlay_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.overlay_url} alt="" className="mt-2 max-h-36 w-full rounded object-cover" />
              ) : null}
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {detections.map((d) =>
        d.latitude != null && d.longitude != null ? (
          <CircleMarker
            key={d.id}
            center={[d.latitude, d.longitude]}
            radius={12}
            pathOptions={{
              color: "#ffffff",
              fillColor: confidenceColor(d.confidence),
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Popup>
              <div className="max-w-[220px] text-sm text-slate-900">
                <strong>{CLASS_LABEL[d.class] ?? d.class}</strong> · {d.confidence.toFixed(0)}%
                <br />
                {d.source ? <span>{d.source}</span> : null}
                <br />
                {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)}
                {d.overlay_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.overlay_url} alt="" className="mt-2 max-h-36 w-full rounded object-cover" />
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  );
}
