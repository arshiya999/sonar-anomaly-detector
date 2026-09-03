"use client";

import { Cell, Label, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
  const total = live.reduce((s, r) => s + r.count, 0);

  return (
    <div className="relative h-full min-h-[240px] w-full">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="46%"
            innerRadius={54}
            outerRadius={86}
            paddingAngle={2}
            stroke="#1c1014"
            strokeWidth={2}
          >
            {data.map((row) => (
              <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#22d3ee"} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} dy="-0.2em" fill="#f8fafc" fontSize="22" fontWeight={700}>
                      {preview ? "8" : total}
                    </tspan>
                    <tspan x={viewBox.cx} dy="1.4em" fill="#fde68a" fontSize="10">
                      {preview ? "classes" : "contacts"}
                    </tspan>
                  </text>
                );
              }}
            />
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
