import { describe, expect, it } from "vitest";
import { generateCiSnippets } from "../src/ci/generateCiSnippets";

describe("generateCiSnippets", () => {
  it("includes CLI command with version and framework", () => {
    const snippets = generateCiSnippets({
      postgresVersion: 16,
      frameworkPreset: "rails",
    });

    expect(snippets.github).toContain("pg-migration-check");
    expect(snippets.github).toContain("--postgres-version 16");
    expect(snippets.github).toContain("--framework rails");
    expect(snippets.gitlab).toContain("pg-migration-check");
    expect(snippets.shell).toContain("pg-migration-check");
  });
});
