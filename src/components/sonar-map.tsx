"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Detection } from "@/lib/types";
import "leaflet/dist/leaflet.css";

const icon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:14px;height:14px;border-radius:999px;background:#5eead4;border:2px solid #042f2e;box-shadow:0 0 0 4px rgba(45,212,191,.35)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [28, 28] });
    }
  }, [map, points]);
  return null;
}

export function SonarMap({ detections }: { detections: Detection[] }) {
  const points = detections
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => [d.latitude as number, d.longitude as number] as [number, number]);
  const center = points[0] ?? ([13.0827, 80.3708] as [number, number]);

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full rounded-xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <Fit points={points} />
      {detections.map((d) =>
        d.latitude != null && d.longitude != null ? (
          <Marker key={d.id} position={[d.latitude, d.longitude]} icon={icon}>
            <Popup>
              <div className="text-sm">
                <strong>{d.class}</strong> · {d.confidence.toFixed(0)}%
                <br />
                {d.id}
                <br />
                {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)}
              </div>
            </Popup>
          </Marker>
        ) : null,
      )}
    </MapContainer>
  );
}
