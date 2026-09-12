"use client";

import { Cell, Label, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";

const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 12,
  color: "#0f172a",
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
  if (live.length === 0) {
    return (
      <div className="grid h-full min-h-[180px] place-items-center px-4 text-center text-sm text-muted-foreground">
        Pie slices appear as soon as a sonar image is classified.
      </div>
    );
  }
  const data = live.map((r) => ({
    class: r.class,
    count: r.count,
    label: CLASS_LABEL[r.class] ?? r.class,
  }));
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
            stroke="#ffffff"
            strokeWidth={2}
          >
            {data.map((row) => (
              <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#0d9488"} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} dy="-0.2em" fill="#0f172a" fontSize="22" fontWeight={700}>
                      {total}
                    </tspan>
                    <tspan x={viewBox.cx} dy="1.4em" fill="#64748b" fontSize="10">
                      contacts
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#334155" }}
            formatter={(value) => <span style={{ color: "#334155" }}>{value}</span>}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
