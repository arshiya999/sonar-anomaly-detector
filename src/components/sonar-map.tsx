"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { Detection } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type Mapped = Detection & { source?: string };

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
      className="h-full min-h-[480px] w-full rounded-xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution="Tiles © Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />
      <FitOnce points={points} />
      {detections.map((d) =>
        d.latitude != null && d.longitude != null ? (
          <CircleMarker
            key={d.id}
            center={[d.latitude, d.longitude]}
            radius={11}
            pathOptions={{
              color: "#ffffff",
              fillColor: CLASS_COLOR[d.class] ?? "#22d3ee",
              fillOpacity: 0.92,
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
                <br />
                Zoom in — this pin stays on the map.
              </div>
            </Popup>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  );
}
