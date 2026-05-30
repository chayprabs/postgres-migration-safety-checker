import { afterEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "@/lib/metadata";
describe("sitemap", () => {
  const snap = { ...process.env };
  afterEach(() => { process.env.NEXT_PUBLIC_SITE_URL = snap.NEXT_PUBLIC_SITE_URL; process.env.VERCEL_URL = snap.VERCEL_URL; });
  it("uses site origin", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://checker.example.test";
    delete process.env.VERCEL_URL;
    const { default: sitemap } = await import("./sitemap");
    expect(sitemap()).toHaveLength(3);
    expect(getSiteUrl()).toBe("https://checker.example.test");
  });
});
