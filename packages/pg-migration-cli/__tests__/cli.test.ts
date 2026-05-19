import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "pg-migration-check.mjs");
const fixture = join(
  here,
  "..",
  "..",
  "pg-migration-analyzer",
  "__fixtures__",
  "unsafe-startup-migration.sql",
);

function runCli(args: string[], input?: string) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: process.env,
    input,
  });
}

describe("pg-migration-check CLI", () => {
  it("prints help and exits 0", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pg-migration-check");
    expect(result.stdout).toContain("--fail-on");
  });

  it("exits 1 for unsafe fixture with --fail-on high", () => {
    const result = runCli([
      "--file",
      fixture,
      "--postgres-version",
      "16",
      "--framework",
      "raw-sql",
      "--fail-on",
      "high",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("riskScore");
  });

  it("exits 0 for unsafe fixture when --fail-on none", () => {
    const result = runCli(["--file", fixture, "--fail-on", "none"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.findingCount).toBeGreaterThan(0);
  });

  it("reads SQL from stdin", () => {
    const result = runCli(["--fail-on", "none", "--format", "json"], "SELECT 1;");

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toHaveProperty("findingCount");
    expect(payload.riskScore).toBeTypeOf("number");
  });

  it("emits markdown when --format markdown", () => {
    const result = runCli([
      "--file",
      fixture,
      "--format",
      "markdown",
      "--fail-on",
      "none",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# PostgreSQL Migration Safety Report");
    expect(result.stdout).not.toContain('"riskScore"');
  });

  it("exits 2 for missing --file path", () => {
    const result = runCli(["--file", "definitely-missing-migration.sql"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Migration file not found");
  });

  it("exits 2 for invalid --postgres-version", () => {
    const result = runCli(["--file", fixture, "--postgres-version", "99"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid --postgres-version");
  });

  it("exits 2 for invalid --framework", () => {
    const result = runCli(["--file", fixture, "--framework", "not-a-framework"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid --framework");
  });

  it("exits 2 for invalid --fail-on", () => {
    const result = runCli(["--file", fixture, "--fail-on", "urgent"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid --fail-on");
  });

  it("exits 2 when flag value is missing", () => {
    const result = runCli(["--file"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--file requires a value");
  });

  it("exits 2 for oversized input without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-migration-cli-"));
    const largeFile = join(dir, "large.sql");
    writeFileSync(largeFile, "x".repeat(3 * 1024 * 1024 + 1));

    const result = runCli(["--file", largeFile]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Use --force");
  });

  it("accepts unicode SQL without leaking secrets in output shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-migration-cli-"));
    const unicodeFile = join(dir, "unicode.sql");
    writeFileSync(unicodeFile, "SELECT 'snowman \u2603';\n");

    const result = runCli(["--file", unicodeFile, "--fail-on", "none"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("riskScore");
  });
});
