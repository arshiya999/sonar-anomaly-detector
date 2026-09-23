import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/aqua-vision-check-kit.zip",
        headers: [
          {
            key: "Content-Disposition",
            value: 'attachment; filename="aqua-vision-check-kit.zip"',
          },
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.onrender.com",
    "*.vercel.app",
    "*.railway.app",
    "*.fly.dev",
  ],
};

export default nextConfig;
