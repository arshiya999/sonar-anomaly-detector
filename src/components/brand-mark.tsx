import { Waves } from "lucide-react";

export function BrandMark({
  onDark = true,
  size = "nav",
}: {
  onDark?: boolean;
  size?: "nav" | "hero";
}) {
  const hero = size === "hero";
  const name = onDark ? "text-white" : "text-cyan-950";
  const sub = onDark ? "text-cyan-100" : "text-cyan-800";

  return (
    <div className={`flex items-center gap-3 ${hero ? "gap-4" : ""}`}>
      <div
        className={`grid shrink-0 place-items-center rounded-md bg-cyan-400 ${hero ? "size-11" : "size-9"}`}
      >
        <Waves className={hero ? "size-5 text-cyan-950" : "size-4 text-cyan-950"} />
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
