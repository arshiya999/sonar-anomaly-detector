"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Marker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
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

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function photoIcon(pin: SurveyPin): L.DivIcon {
  const size = pin.latest ? 52 : 44;
  const ring = pin.latest ? "#fbbf24" : "#ffffff";
  const src = pin.overlay_url;
  const inner = src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(pin.material)}" />`
    : `<span>${escapeAttr((pin.material || "?").slice(0, 2))}</span>`;
  return L.divIcon({
    className: "sonar-photo-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div class="sonar-photo-pin-face ${pin.latest ? "is-latest" : ""}" style="width:${size}px;height:${size}px;border-color:${ring}">${inner}</div>`,
  });
}

function PhotoPin({ pin }: { pin: SurveyPin }) {
  const icon = useMemo(
    () => photoIcon(pin),
    [pin.id, pin.overlay_url, pin.latest, pin.material],
  );
  const photo = pin.overlay_url;
  return (
    <Marker pane="pins" position={[pin.latitude, pin.longitude]} icon={icon}>
      <Tooltip permanent direction="top" offset={[0, pin.latest ? -28 : -24]} className="sonar-material-label">
        {pin.latest ? `Latest · ${pin.material}` : pin.material}
      </Tooltip>
      <Popup>
        <div className="max-w-[260px] text-sm text-slate-900">
          <p className="text-[10px] font-semibold tracking-wide text-blue-700 uppercase">
            {pin.latest ? "Latest ping (this upload)" : "Earlier ping (previous upload)"}
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
            <p className="mt-2 text-xs text-slate-500">No sonar frame stored for this ping yet. Re-upload to attach the photo.</p>
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
        <PhotoPin key={`${s.id}-survey`} pin={s} />
      ))}
    </MapContainer>
  );
}
