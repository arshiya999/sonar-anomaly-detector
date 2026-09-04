import { useEffect, useState } from "react";
import { Card, Empty } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type ReportList = { id: string; survey_id: string; survey_name: string | null; created_at: string; detections: number; frames: number };

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportList[]>([]);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api<ReportList[]>("/api/reports").then(setRows);
  }, []);

  return (
    <Card title="Reports">
      {rows.length === 0 ? (
        <Empty text="No reports. Process a survey first." />
      ) : (
        <div className="space-y-3">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th>Report</th>
                <th>Survey</th>
                <th>Frames</th>
                <th>Detections</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 font-mono">{r.id.slice(0, 8)}</td>
                  <td>{r.survey_name}</td>
                  <td>{r.frames}</td>
                  <td>{r.detections}</td>
                  <td className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => api<Record<string, unknown>>(`/api/reports/${r.id}`).then(setPayload)}>
                      View
                    </Button>
                    <a className="text-blue-600" href={`/api/reports/${r.id}/json`}>JSON</a>
                    <a className="text-blue-600" href={`/api/reports/${r.id}/csv`}>CSV</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payload ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px]">{JSON.stringify(payload, null, 2)}</pre>
          ) : null}
        </div>
      )}
    </Card>
  );
}
