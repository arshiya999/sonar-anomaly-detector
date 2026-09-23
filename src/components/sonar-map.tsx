"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Marker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Detection, SurveyPin } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type Mapped = Detection & { source?: string };

function FitPins({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = `${points.length}:${points[0]?.join(",") ?? ""}:${points[points.length - 1]?.join(",") ?? ""}`;
  useEffect(() => {
    const fit = () => {
      try {
        map.invalidateSize();
        if (map.getSize().x < 8) return false;
        if (points.length === 0) {
          map.setView([13.0827, 80.2707], 10);
          return true;
        }
        if (points.length === 1) {
          map.setView(points[0], 13);
          return true;
        }
        map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 13 });
        return true;
      } catch {
        return true;
      }
    };
    fit();
    const t1 = window.setTimeout(fit, 80);
    const t2 = window.setTimeout(fit, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
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

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function photoIcon(pin: SurveyPin): L.DivIcon {
  const size = pin.latest ? 58 : 50;
  const rejected = pin.material === "Rejected" || pin.ageLabel?.includes("Rejected");
  const ring = pin.latest ? "#fbbf24" : rejected ? "#fb7185" : "#22d3ee";
  const src = pin.overlay_url;
  const inner = src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(pin.material)}" />`
    : `<span>${escapeAttr((rejected ? "RJ" : "SN").slice(0, 2))}</span>`;
  return L.divIcon({
    className: "sonar-photo-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div class="sonar-photo-pin-face ${pin.latest ? "is-latest" : ""} ${rejected ? "is-rejected" : "is-sonar"}" style="width:${size}px;height:${size}px;border-color:${ring}">${inner}</div>`,
  });
}

function PhotoPin({ pin }: { pin: SurveyPin }) {
  const icon = useMemo(
    () => photoIcon(pin),
    [pin.id, pin.overlay_url, pin.latest, pin.material, pin.ageLabel],
  );
  const photo = pin.overlay_url;
  return (
    <Marker pane="pins" position={[pin.latitude, pin.longitude]} icon={icon} zIndexOffset={pin.latest ? 800 : 400}>
      <Tooltip permanent direction="top" offset={[0, pin.latest ? -32 : -28]} className="sonar-material-label">
        {pin.material}
      </Tooltip>
      <Popup>
        <div className="max-w-[260px] text-sm text-slate-900">
          <p className="text-[10px] font-semibold tracking-wide text-cyan-800 uppercase">
            {pin.ageLabel || (pin.latest ? "Latest ping" : "Survey ping")}
          </p>
          <p className="font-semibold">{pin.material}</p>
          <p className="text-xs text-slate-600">{pin.filename}</p>
          <p className="font-mono text-[11px]">
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </p>
          {pin.confidence != null ? (
            <p className="text-xs">{pin.confidence.toFixed(0)}% confidence</p>
          ) : null}
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={pin.material} className="mt-2 max-h-48 w-full rounded object-cover" />
          ) : (
            <p className="mt-2 text-xs text-slate-500">No photo on this ping.</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export function SonarMap({
  surveys = [],
  basemap = "world",
  onPickOrigin,
}: {
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
  const zoom = points.length ? 12 : 8;

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
        <PhotoPin key={`${s.id}-survey`} pin={s} />
      ))}
    </MapContainer>
  );
}
