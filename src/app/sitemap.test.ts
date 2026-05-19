import { afterEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "@/lib/metadata";

const STATIC_ROUTE_COUNT = 11;

describe("sitemap site origin", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = envSnapshot.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = envSnapshot.VERCEL_URL;
  });

  it("builds absolute URLs from the configured site origin", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://checker.example.test";
    delete process.env.VERCEL_URL;

    const { default: sitemap } = await import("./sitemap");
    const entries = sitemap();

    expect(entries).toHaveLength(STATIC_ROUTE_COUNT);
    expect(entries.every((entry) => entry.url.startsWith("https://checker.example.test"))).toBe(
      true,
    );
    expect(entries.some((entry) => entry.url.endsWith("/tools/postgres-migration-safety-checker"))).toBe(
      true,
    );
    expect(getSiteUrl()).toBe("https://checker.example.test");
  });
});
