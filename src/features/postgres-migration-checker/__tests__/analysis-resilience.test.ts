import { describe, expect, it } from "vitest";
import { analyzeSql } from "./testUtils";

describe("analysis resilience", () => {
  it("returns fallback findings instead of crashing on malformed SQL", async () => {
    const result = await analyzeSql(
      "ALTER TABLE public.users ADD COLUMN status text DEFAULT 'unterminated;",
    );

    expect(result.metadata.parser.parser).toBe("fallback");
    expect(result.metadata.parser.errors.length).toBeGreaterThan(0);
    expect(
      result.findings.some((finding) => finding.category === "syntax"),
    ).toBe(true);
  });

  it("maps PostgreSQL 18 to parser 17 with an explicit version-fallback warning", async () => {
    const result = await analyzeSql("SELECT 1;", {
      postgresVersion: 18,
    });

    expect(result.metadata.parser.effectiveVersion).toBe(17);
    expect(result.metadata.parserVersionUsed).toBe(17);
    expect(
      result.metadata.parser.warnings.some(
        (warning) => warning.code === "parser.version-fallback",
      ),
    ).toBe(true);
    expect(result.metadata.parser.warnings[0]?.message).toMatch(/PostgreSQL 18/i);
  });

  it("still reports secret warnings when parser fallback is used", async () => {
    const result = await analyzeSql(
      "-- postgres://deploy:super-secret-value@db.internal.example.com/app\nALTER TABLE public.users ADD COLUMN note text DEFAULT 'unterminated;",
      {
        redactionMode: true,
      },
    );

    expect(
      result.findings.some(
        (finding) => finding.ruleId === "PGM900_POSSIBLE_SECRET_IN_INPUT",
      ),
    ).toBe(true);
  });
});
