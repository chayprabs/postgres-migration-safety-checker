import { describe, expect, it } from "vitest";
import type { AnalysisSettings } from "../../types";
import { runAnalysisPipeline } from "../analysisPipeline";
import {
  SECRET_DETECTION_RULE_ID,
  collectSecretRedactionMatches,
  redactSecretsInText,
} from "./secretDetection";

function createSettings(
  overrides: Partial<AnalysisSettings> = {},
): AnalysisSettings {
  return {
    postgresVersion: 16,
    frameworkPreset: "raw-sql",
    tableSizeProfile: "large",
    includeLowSeverityFindings: true,
    includeInfoFindings: true,
    includeSafeRewrites: true,
    assumeOnlineMigration: true,
    assumeRunsInTransaction: false,
    transactionAssumptionMode: "auto",
    flagDestructiveChanges: true,
    redactionMode: false,
    autoAnalyze: true,
    reportFormat: "markdown",
    stopAfterParseError: false,
    ...overrides,
  };
}

describe("secret detection", () => {
  it("redacts likely secrets in copied snippets without echoing the original value", () => {
    const sql = `-- github token: ghp_1234567890abcdefghijklmnopqrstuv
-- connection: postgres://deploy:s3cr3tPass@db.internal.example.com/app
-- jwt: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue`;

    const redacted = redactSecretsInText(sql);

    expect(redacted).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(redacted).toContain("[REDACTED_PASSWORD]");
    expect(redacted).toContain("[REDACTED_JWT]");
    expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuv");
    expect(redacted).not.toContain("s3cr3tPass");
    expect(redacted).not.toContain(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue",
    );
  });

  it("creates security findings with redacted previews only", async () => {
    const sql = `-- password = 'super-secret-password'
ALTER ROLE app_user PASSWORD 'dont-echo-this';
SELECT 1;`;
    const result = await runAnalysisPipeline({
      sql,
      settings: createSettings(),
      runtime: {
        mode: "main-thread",
      },
    });
    const secretFindings = result.findings.filter(
      (finding) => finding.ruleId === SECRET_DETECTION_RULE_ID,
    );

    expect(secretFindings.length).toBeGreaterThanOrEqual(2);
    expect(
      secretFindings.every((finding) => finding.category === "security"),
    ).toBe(true);
    expect(
      secretFindings.some((finding) =>
        finding.redactedPreview?.includes("[REDACTED_PASSWORD]"),
      ),
    ).toBe(true);
    expect(
      secretFindings.every(
        (finding) =>
          !finding.summary.includes("super-secret-password") &&
          !finding.summary.includes("dont-echo-this"),
      ),
    ).toBe(true);
  });

  it("keeps generic token assignments at medium severity", () => {
    const matches = collectSecretRedactionMatches(
      "-- token = abcdefghijklmnop1234567890",
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.severity).toBe("medium");
    expect(matches[0]?.redactedPreview).toContain("REDACTED_TOKEN");
  });
});
