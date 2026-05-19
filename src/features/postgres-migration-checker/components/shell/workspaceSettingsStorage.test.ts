import { describe, expect, it } from "vitest";
import {
  createDefaultWorkspaceSettings,
  mergePersistedWorkspaceSettings,
} from "./workspaceSettingsStorage";

describe("workspace settings persistence", () => {
  it("returns defaults for nullish persisted values", () => {
    expect(mergePersistedWorkspaceSettings(null)).toEqual(
      createDefaultWorkspaceSettings(),
    );
    expect(mergePersistedWorkspaceSettings(undefined)).toEqual(
      createDefaultWorkspaceSettings(),
    );
  });

  it("ignores invalid enum fields and keeps defaults", () => {
    const merged = mergePersistedWorkspaceSettings({
      postgresVersion: 99,
      frameworkPreset: "not-real",
      tableSizeProfile: "huge",
      autoAnalyze: "yes",
      showLowSeverity: "no",
      redactionMode: 1,
    });

    expect(merged.postgresVersion).toBe(16);
    expect(merged.frameworkPreset).toBe("raw-sql");
    expect(merged.tableSizeProfile).toBe("large");
    expect(merged.autoAnalyze).toBe(true);
    expect(merged.showLowSeverity).toBe(true);
    expect(merged.redactionMode).toBe(false);
  });

  it("accepts valid persisted settings", () => {
    const merged = mergePersistedWorkspaceSettings({
      postgresVersion: 17,
      frameworkPreset: "rails",
      tableSizeProfile: "very-large",
      autoAnalyze: false,
      showLowSeverity: false,
      redactionMode: true,
    });

    expect(merged).toEqual({
      postgresVersion: 17,
      frameworkPreset: "rails",
      tableSizeProfile: "very-large",
      autoAnalyze: false,
      showLowSeverity: false,
      redactionMode: true,
    });
  });
});
