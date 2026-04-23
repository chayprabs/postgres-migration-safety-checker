import { describe, expect, it } from "vitest";
import { createHtmlReport } from "../reports/htmlReport";
import { createJsonReport, stringifyJsonReport } from "../reports/jsonReport";
import { createMarkdownReport } from "../reports/markdownReport";
import {
  analyzeSql,
  createReportExportInput,
  getFinding,
  loadFixtureSql,
} from "./testUtils";

describe("report generation", () => {
  it("builds a markdown report with score, counts, and findings", async () => {
    const result = await analyzeSql(
      loadFixtureSql("unsafe-startup-migration.sql"),
    );
    const markdown = createMarkdownReport(createReportExportInput(result));

    expect(markdown).toContain("# PostgreSQL Migration Safety Report");
    expect(markdown).toContain(
      `Risk score: ${result.summary.risk.score}/100 (${result.summary.risk.label})`,
    );
    expect(markdown).toContain("## Findings Table");
    expect(markdown).toContain(
      getFinding(result, "PGM020_CREATE_INDEX_WITHOUT_CONCURRENTLY").title,
    );
  });

  it("omits raw statement SQL snippets from markdown exports by default", async () => {
    const result = await analyzeSql(
      "ALTER TABLE public.users ADD COLUMN status text DEFAULT 'report_marker_12345';",
    );
    const markdown = createMarkdownReport(createReportExportInput(result));

    expect(markdown).toContain("Include SQL snippets: No");
    expect(markdown).not.toContain("report_marker_12345");
  });

  it("keeps HTML reports self-contained without script tags", async () => {
    const result = await analyzeSql(
      loadFixtureSql("unsafe-startup-migration.sql"),
    );
    const html = createHtmlReport(createReportExportInput(result));

    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\ssrc=/i);
  });

  it("strips raw SQL from JSON exports by default", async () => {
    const result = await analyzeSql(
      "ALTER TABLE public.users ADD COLUMN status text DEFAULT 'json_marker_456';",
    );
    const report = createJsonReport(createReportExportInput(result));
    const json = stringifyJsonReport(createReportExportInput(result));

    expect(
      report.analysisResult.statements.every(
        (statement) =>
          typeof statement.raw === "undefined" &&
          typeof statement.normalized === "undefined",
      ),
    ).toBe(true);
    expect(json).not.toContain("json_marker_456");
  });

  it("redacts secrets when SQL snippets are explicitly included in exports", async () => {
    const result = await analyzeSql(
      `-- connection: postgres://deploy:super-secret-password@db.internal.example.com/app
ALTER TABLE public.users ADD COLUMN status text DEFAULT 'active';`,
      {
        redactionMode: true,
      },
    );
    const reportInput = createReportExportInput(result, {
      options: {
        generatedAt: "2026-04-23T12:00:00.000Z",
        includeSqlSnippets: true,
        redactionMode: true,
        sourceFilename: "sensitive.sql",
      },
    });
    const markdown = createMarkdownReport(reportInput);
    const json = stringifyJsonReport(reportInput);

    expect(markdown).toContain("[REDACTED_PASSWORD]");
    expect(markdown).not.toContain("super-secret-password");
    expect(json).toContain("[REDACTED_PASSWORD]");
    expect(json).not.toContain("super-secret-password");
  });
});
