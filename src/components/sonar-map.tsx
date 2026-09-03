"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { Detection } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type Mapped = Detection & { source?: string };

const TRANSECT: [number, number][] = [
  [13.055, 80.305],
  [13.068, 80.338],
  [13.0827, 80.3708],
  [13.096, 80.402],
  [13.112, 80.438],
];

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 13);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    done.current = true;
  }, [map, points]);
  return null;
}

export function SonarMap({ detections }: { detections: Mapped[] }) {
  const points = useMemo(
    () =>
      detections
        .filter((d) => d.latitude != null && d.longitude != null)
        .map((d) => [d.latitude as number, d.longitude as number] as [number, number]),
    [detections],
  );
  const center = points[0] ?? ([13.0827, 80.3708] as [number, number]);

  return (
    <MapContainer
      center={center}
      zoom={11}
      className="h-full min-h-[280px] w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution="Tiles © Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      <Polyline
        positions={TRANSECT}
        pathOptions={{ color: "#22d3ee", weight: 3, dashArray: "10 8", opacity: 0.85 }}
      />
      <FitOnce points={points} />
      {detections.map((d) =>
        d.latitude != null && d.longitude != null ? (
          <CircleMarker
            key={d.id}
            center={[d.latitude, d.longitude]}
            radius={12}
            pathOptions={{
              color: "#ffffff",
              fillColor: CLASS_COLOR[d.class] ?? "#22d3ee",
              fillOpacity: 0.95,
              weight: 2,
            }}
          >
            <Popup>
              <div className="text-sm text-slate-900">
                <strong>{CLASS_LABEL[d.class] ?? d.class}</strong> · {d.confidence.toFixed(0)}%
                <br />
                {d.source ? <span>{d.source}</span> : null}
                <br />
                {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)}
              </div>
            </Popup>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  );
}
