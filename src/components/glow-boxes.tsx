"use client";

import { useCallback, useEffect, useRef } from "react";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { DetectReport } from "@/lib/types";

export function GlowBoxes({
  report,
  imageSrc,
}: {
  report: DetectReport | null;
  imageSrc: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paint = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (!w || !h) return;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!report?.detections.length) return;
    const sx = w / report.image_size.width;
    const sy = h / report.image_size.height;
    for (const det of report.detections) {
      const [x1, y1, x2, y2] = det.bbox_xyxy;
      const color = CLASS_COLOR[det.class] ?? "#22d3ee";
      const rx = x1 * sx;
      const ry = y1 * sy;
      const rw = (x2 - x1) * sx;
      const rh = (y2 - y1) * sy;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
      const tag = `${CLASS_LABEL[det.class] ?? det.class}  ${det.confidence.toFixed(0)}%`;
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      const tw = ctx.measureText(tag).width + 10;
      const ty = Math.max(14, ry - 2);
      ctx.fillStyle = "rgba(3,16,24,0.82)";
      ctx.fillRect(rx, ty - 13, tw, 15);
      ctx.fillStyle = color;
      ctx.fillText(tag, rx + 5, ty - 2);
    }
  };

  useEffect(() => {
    paint();
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(paint);
    ro.observe(img);
    window.addEventListener("resize", paint);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [report, imageSrc]); // paint reads latest report via closure on each effect run

  return (
    <div className="relative inline-block max-h-[560px] max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Side-scan sonar waterfall"
        className="max-h-[560px] max-w-full object-contain"
        onLoad={paint}
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0" />
    </div>
  );
}
