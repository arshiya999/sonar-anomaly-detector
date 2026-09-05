import { Waves } from "lucide-react";

export function BrandMark({
  onDark = true,
  size = "nav",
}: {
  onDark?: boolean;
  size?: "nav" | "hero";
}) {
  const hero = size === "hero";
  const name = onDark ? "text-white" : "text-slate-900";
  const sub = onDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`flex items-center gap-3 ${hero ? "gap-4" : ""}`}>
      <div
        className={`grid shrink-0 place-items-center rounded-md bg-[#2563eb] ${hero ? "size-11" : "size-9"}`}
      >
        <Waves className={hero ? "size-5 text-white" : "size-4 text-white"} />
      </div>
      <div className="min-w-0">
        <p
          className={`font-heading font-bold tracking-tight ${name} ${hero ? "text-3xl" : "text-lg"}`}
        >
          Aqua Vision
        </p>
        <p className={`text-xs ${sub}`}>Side-scan sonar</p>
      </div>
    </div>
  );
}
