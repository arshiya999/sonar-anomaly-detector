import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Empty } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { SurveyRow } from "@/lib/types";

export default function HistoryPage() {
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<SurveyRow[]>("/api/surveys").then(setRows);
  }, []);

  const shown = rows.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.status.toLowerCase().includes(q.toLowerCase()) ||
      s.source_name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Card title="Survey history">
      <Input placeholder="Filter by name, source, status" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 max-w-sm" />
      {shown.length === 0 ? (
        <Empty text="No surveys in the database" />
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th>Survey ID</th>
              <th>File / Source</th>
              <th>Date</th>
              <th>Status</th>
              <th>Frames</th>
              <th>Detections</th>
              <th>Alerts</th>
              <th>Model</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-2 font-mono">{s.id.slice(0, 8)}</td>
                <td>{s.source_name}</td>
                <td>{s.created_at?.replace("T", " ").slice(0, 19)}</td>
                <td>{s.status}</td>
                <td>{s.frames}</td>
                <td>{s.detections}</td>
                <td>{s.alerts}</td>
                <td>{s.model ?? "—"}</td>
                <td>
                  <Link className="text-blue-600" to="/analysis">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
