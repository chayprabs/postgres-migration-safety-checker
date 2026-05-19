import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@authos/pg-migration-analyzer"],
};

export default nextConfig;
