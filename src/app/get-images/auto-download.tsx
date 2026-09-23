"use client";

import { useEffect } from "react";

export function AutoDownloadZip() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = "/api/download-kit";
      a.download = "aqua-vision-check-kit.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <iframe title="Download kit" className="hidden" src="/api/download-kit" />
  );
}
