import { useEffect, useState } from "react";
import { DetectionMap } from "@/components/DetectionMap";
import { Card, Empty } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Detection } from "@/lib/types";

export default function MapPage() {
  const [pts, setPts] = useState<Detection[]>([]);
  const [track, setTrack] = useState<{ lat: number; lon: number }[]>([]);
  const [trackOk, setTrackOk] = useState<boolean | null>(null);

  useEffect(() => {
    api<Detection[]>("/api/detections/map").then(setPts);
    api<{ id: string }[]>("/api/surveys").then(async (surveys) => {
      const live = surveys[0];
      if (!live) {
        setTrackOk(false);
        return;
      }
      const s = await api<{ track_available: boolean; track: { lat: number; lon: number }[] }>(`/api/surveys/${live.id}`);
      setTrackOk(s.track_available);
      setTrack(s.track || []);
    });
  }, []);

  return (
    <Card title="Live / global survey map">
      <p className="mb-2 text-xs text-slate-500">
        OpenStreetMap. Pins only appear when detections have actual latitude/longitude. Red &gt;80%, orange 50–80%, green &lt;50%.
      </p>
      {trackOk === false ? <p className="mb-2 text-xs text-orange-700">Survey track cannot be displayed — GPS unavailable.</p> : null}
      <div className="h-[640px] overflow-hidden rounded-lg">
        {pts.length === 0 && track.length < 2 ? (
          <Empty text="No geotagged detections and no GPS track" />
        ) : (
          <DetectionMap
            points={pts.map((p) => ({
              id: p.id,
              latitude: p.latitude as number,
              longitude: p.longitude as number,
              class_name: p.class_name,
              final_confidence: p.final_confidence,
              timestamp: p.timestamp,
              survey_id: p.survey_id,
              validation_status: p.validation_status,
            }))}
            track={trackOk ? track : []}
            current={track.length ? { lat: track[track.length - 1].lat, lon: track[track.length - 1].lon } : null}
          />
        )}
      </div>
    </Card>
  );
}
