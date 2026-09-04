import type { NextConfig } from "next";

const OPS = process.env.OPS_API_URL ?? "http://127.0.0.1:8766";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.cursor.sh",
    "*.cursorusercontent.com",
    "*.loca.lt",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.onrender.com",
    "*.railway.app",
    "*.fly.dev",
  ],
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${OPS}/media/:path*` }];
  },
};

export default nextConfig;
