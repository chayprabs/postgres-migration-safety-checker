import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  transpilePackages: ["@pg-migration-checker/analyzer"],
  async redirects() {
    return [
      { source: "/tools/postgres-migration-safety-checker", destination: "/", permanent: true },
      { source: "/tools", destination: "/", permanent: true },
      { source: "/about", destination: "/", permanent: true },
      { source: "/docs/:path*", destination: "/", permanent: true },
    ];
  },
};
export default nextConfig;
