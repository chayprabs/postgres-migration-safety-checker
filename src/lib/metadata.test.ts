import { afterEach, describe, expect, it } from "vitest";
import { getSiteUrl } from "./metadata";

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_URL",
] as const;

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe("getSiteUrl", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("prefers NEXT_PUBLIC_SITE_URL when configured", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://checker.example.test/";
    delete process.env.VERCEL_URL;

    expect(getSiteUrl()).toBe("https://checker.example.test");
  });

  it("falls back to VERCEL_URL when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "postgres-checker.vercel.app";

    expect(getSiteUrl()).toBe("https://postgres-checker.vercel.app");
  });

  it("defaults to localhost when no deploy env vars are set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});
