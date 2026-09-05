import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: ".next-moneymentor",
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  allowedDevOrigins: ["potter-further-tel-covers.trycloudflare.com"],
};

export default nextConfig;
