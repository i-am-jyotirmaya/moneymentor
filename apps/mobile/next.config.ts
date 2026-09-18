import type { NextConfig } from "next";
import path from "node:path";
import { validateApiUrl } from "./lib/config.mjs";

validateApiUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV === "production");

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};

export default config;
