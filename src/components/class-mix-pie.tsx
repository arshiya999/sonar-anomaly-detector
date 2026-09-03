"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";

const TOOLTIP_STYLE = {
  background: "#0f2740",
  border: "1px solid #2dd4bf",
  borderRadius: 10,
  fontSize: 12,
  color: "#ecfeff",
};

type Row = { class: string; count: number };

export function ClassMixPie({
  rows,
  height = 280,
}: {
  rows: Row[];
  height?: number;
}) {
  const live = rows.filter((r) => r.count > 0);
  const preview = live.length === 0;
  const data = (preview ? Object.keys(CLASS_LABEL).map((cls) => ({ class: cls, count: 1 })) : live).map(
    (r) => ({
      class: r.class,
      count: r.count,
      label: CLASS_LABEL[r.class] ?? r.class,
    }),
  );

  return (
    <div className="relative h-full min-h-[240px] w-full">
      {preview ? (
        <p className="absolute top-0 left-0 z-10 max-w-[14rem] text-[11px] leading-snug text-cyan-200/90">
          Colour key — slices fill from real detections after a scan.
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="52%"
            innerRadius={48}
            outerRadius={88}
            paddingAngle={2}
            stroke="#082f49"
            strokeWidth={2}
          >
            {data.map((row) => (
              <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#22d3ee"} />
            ))}
          </Pie>
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#e2e8f0" }}
            formatter={(value) => <span style={{ color: "#e2e8f0" }}>{value}</span>}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
