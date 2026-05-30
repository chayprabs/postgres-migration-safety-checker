import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata";
const staticRoutes = ["/", "/privacy", "/terms"] as const;
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return staticRoutes.map((path) => ({ url: `${siteUrl}${path}`, lastModified: new Date() }));
}
