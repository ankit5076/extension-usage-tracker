import type { NextConfig } from "next";
import { appBasePath } from "./src/lib/config";

const publicBasePath = appBasePath();

const nextConfig: NextConfig = {
  output: "standalone",
  ...(publicBasePath ? { assetPrefix: publicBasePath } : {}),
};

export default nextConfig;
