import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  class_name?: string;
  final_confidence?: number;
  timestamp?: string | null;
  survey_id?: string;
  validation_status?: string;
};

function color(c?: number) {
  if (c == null) return "#64748b";
  if (c > 80) return "#ef4444";
  if (c >= 50) return "#f97316";
  return "#22c55e";
}

export function DetectionMap({
  points,
  track,
  current,
}: {
  points: MapPoint[];
  track?: { lat: number; lon: number }[];
  current?: { lat: number; lon: number } | null;
}) {
  const center: [number, number] = points[0]
    ? [points[0].latitude, points[0].longitude]
    : track?.[0]
      ? [track[0].lat, track[0].lon]
      : [0, 20];
  const zoom = points.length || track?.length ? 8 : 2;

  return (
    <MapContainer center={center} zoom={zoom} className="h-full min-h-[280px] w-full" scrollWheelZoom>
      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {track && track.length > 1 ? (
        <Polyline positions={track.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: "#2563eb", weight: 3 }} />
      ) : null}
      {current ? (
        <CircleMarker center={[current.lat, current.lon]} radius={8} pathOptions={{ color: "#fde047", fillColor: "#2563eb", fillOpacity: 1 }}>
          <Popup>Current sonar/vessel position</Popup>
        </CircleMarker>
      ) : null}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={10}
          pathOptions={{ color: "#fff", fillColor: color(p.final_confidence), fillOpacity: 0.95, weight: 2 }}
        >
          <Popup>
            <div className="text-sm text-slate-900">
              <strong>{p.id.slice(0, 8)}</strong>
              <br />
              {p.class_name} · {p.final_confidence?.toFixed(0)}%
              <br />
              {p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}
              <br />
              {p.timestamp || "timestamp unavailable"}
              <br />
              Survey {p.survey_id}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
