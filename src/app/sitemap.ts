import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata";

const staticRoutes = [
  "/",
  "/about",
  "/docs",
  "/docs/create-index-concurrently",
  "/docs/postgres-foreign-key-not-valid",
  "/docs/postgresql-migration-locks",
  "/docs/rails-postgres-migration-safety",
  "/docs/safe-postgres-not-null-migration",
  "/privacy",
  "/tools",
  "/tools/postgres-migration-safety-checker",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
  }));
}
