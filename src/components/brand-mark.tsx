import { Waves } from "lucide-react";

export function BrandMark({
  onDark = true,
  size = "nav",
}: {
  onDark?: boolean;
  size?: "nav" | "hero";
}) {
  const aqua = onDark ? "text-cyan-300" : "text-sky-700";
  const vision = onDark
    ? "bg-gradient-to-r from-white via-sky-100 to-cyan-300 bg-clip-text text-transparent"
    : "bg-gradient-to-r from-slate-900 via-sky-800 to-cyan-700 bg-clip-text text-transparent";
  const tag = onDark ? "text-slate-400" : "text-slate-500";
  const hero = size === "hero";

  return (
    <div className={`flex items-start gap-3 ${hero ? "gap-4" : ""}`}>
      <div
        className={`sonar-logo mt-0.5 grid shrink-0 place-items-center rounded-lg bg-[#2563eb] shadow-[0_0_24px_rgba(56,189,248,0.35)] ${
          hero ? "size-12" : "size-9"
        }`}
      >
        <Waves className={hero ? "size-6 text-white" : "size-5 text-white"} />
      </div>
      <div className="min-w-0 leading-none">
        <p
          className={`font-heading font-semibold uppercase ${aqua} ${
            hero ? "text-xs tracking-[0.55em]" : "text-[10px] tracking-[0.48em]"
          }`}
        >
          Aqua
        </p>
        <p
          className={`font-display italic ${vision} ${
            hero ? "mt-1 text-5xl" : "mt-0.5 text-[1.65rem]"
          }`}
        >
          Vision
        </p>
        <p
          className={`mt-1.5 font-heading uppercase ${tag} ${
            hero ? "text-xs tracking-[0.28em]" : "hidden"
          }`}
        >
          See what the seafloor hides
        </p>
      </div>
    </div>
  );
}
