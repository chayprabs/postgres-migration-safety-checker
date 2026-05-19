import { describe, expect, it } from "vitest";
import { parseSchemaSql, schemaHasColumn, schemaHasTable } from "../src/schema/parseSchema";
import { runAnalysisPipeline } from "../src/analyzer/analysisPipeline";

describe("parseSchemaSql", () => {
  it("indexes tables and columns from CREATE TABLE statements", () => {
    const schema = parseSchemaSql(`
      CREATE TABLE public.users (
        id bigint PRIMARY KEY,
        email text NOT NULL
      );
    `);

    expect(schemaHasTable(schema, "public.users")).toBe(true);
    expect(schemaHasColumn(schema, "public.users", "email")).toBe(true);
    expect(schemaHasTable(schema, "public.orders")).toBe(false);
  });
});

describe("schema-aware rules", () => {
  it("flags ALTER TABLE when schema context omits the relation", async () => {
    const result = await runAnalysisPipeline({
      sql: "ALTER TABLE public.orders ADD COLUMN status text;",
      settings: {
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
        autoAnalyze: false,
        reportFormat: "markdown",
        stopAfterParseError: false,
        schemaSql: "CREATE TABLE public.users (id bigint PRIMARY KEY);",
      },
      runtime: { mode: "main-thread" },
    });

    expect(
      result.findings.some((finding) => finding.ruleId === "PGM040_ALTER_UNKNOWN_TABLE"),
    ).toBe(true);
  });
});
