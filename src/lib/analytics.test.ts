import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "./analytics";

describe("sanitizeAnalyticsEvent", () => {
  it("strips obvious dangerous keys from analysis payloads", () => {
    const event = sanitizeAnalyticsEvent("analysis_completed", {
      toolId: "postgres-migration-safety-checker",
      inputLength: 920,
      statementCount: 4,
      findingCount: 2,
      durationMs: 120,
      parserUsed: "supabase-pg-parser",
      sampleUsed: false,
      severityCounts: {
        critical: 0,
        high: 1,
        medium: 1,
        low: 0,
        info: 0,
      },
      categoriesPresent: ["locking", "transaction"],
      settingsSummary: {
        postgresVersion: 16,
        frameworkPreset: "rails",
        tableSizeProfile: "large",
        redactionMode: true,
      },
      sql: "ALTER TABLE users ADD COLUMN secret text;",
      rawSql: "DROP TABLE payments;",
      filename: "20260423_add_users.sql",
      sourceFilename: "20260423_add_users.sql",
      tableName: "users",
      columnName: "secret",
      snippet: "ADD COLUMN secret",
      reportText: "# report",
      secretPreview: "postgres://user:password@example",
      nested: {
        sql: "DROP TABLE payments;",
        objectName: "payments",
      },
    });

    expect(event.name).toBe("analysis_completed");
    expect(event.payload).toMatchObject({
      toolId: "postgres-migration-safety-checker",
      inputSizeBucket: "medium",
      statementCountBucket: "2-5",
      findingCountBucket: "2-5",
      parserMode: "parser",
      redactionModeEnabled: true,
      sampleUsed: false,
      frameworkPreset: "rails",
      postgresVersion: 16,
      tableSizeProfile: "large",
      categoriesPresent: ["locking", "transaction"],
    });
    expect(JSON.stringify(event.payload)).not.toContain("users");
    expect(JSON.stringify(event.payload)).not.toContain("secret");
    expect(JSON.stringify(event.payload)).not.toContain("password");
    expect(JSON.stringify(event.payload)).not.toContain("report");
    expect("rawSql" in event.payload).toBe(false);
    expect("filename" in event.payload).toBe(false);
    expect("snippet" in event.payload).toBe(false);
  });

  it("forces analysis failure payloads into the allowed schema", () => {
    const event = sanitizeAnalyticsEvent("analysis_failed", {
      toolId: "postgres-migration-safety-checker",
      inputLength: 0,
      sampleUsed: true,
      settingsSummary: {
        postgresVersion: 15,
        frameworkPreset: "prisma",
        tableSizeProfile: "medium",
        redactionMode: false,
      },
      stack: "Error: bad\n at sql",
    });

    expect(event).toMatchObject({
      name: "analysis_failed",
      payload: {
        toolId: "postgres-migration-safety-checker",
        inputSizeBucket: "empty",
        parserMode: "error",
        sampleUsed: true,
        frameworkPreset: "prisma",
        postgresVersion: 15,
        tableSizeProfile: "medium",
      },
    });
    expect("stack" in event.payload).toBe(false);
  });
});
