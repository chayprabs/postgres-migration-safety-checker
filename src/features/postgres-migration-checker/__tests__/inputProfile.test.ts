import { describe, expect, it } from "vitest";
import {
  canSafelyOverrideBlockedInput,
  getSqlInputProfile,
  getUtf8ByteLength,
} from "../inputProfile";

describe("SQL input profiling", () => {
  it("counts UTF-8 byte length without allocating a second full buffer", () => {
    expect(getUtf8ByteLength("plain ascii")).toBe(11);
    expect(getUtf8ByteLength("snowman \u2603")).toBe(11);
    expect(getUtf8ByteLength("rocket \ud83d\ude80")).toBe(11);
  });

  it("assigns the documented size buckets at each threshold", () => {
    expect(getSqlInputProfile("a".repeat(250 * 1024)).bucket).toBe("normal");
    expect(getSqlInputProfile("a".repeat(250 * 1024 + 1)).bucket).toBe("warning");
    expect(getSqlInputProfile("a".repeat(1024 * 1024)).bucket).toBe("warning");
    expect(getSqlInputProfile("a".repeat(1024 * 1024 + 1)).bucket).toBe(
      "confirmation-required",
    );
    expect(getSqlInputProfile("a".repeat(3 * 1024 * 1024)).bucket).toBe(
      "confirmation-required",
    );
    expect(getSqlInputProfile("a".repeat(3 * 1024 * 1024 + 1)).bucket).toBe(
      "blocked",
    );
  });

  it("only allows blocked-size overrides when worker and browser resources look safe", () => {
    const blockedProfile = getSqlInputProfile("a".repeat(3 * 1024 * 1024 + 1));

    expect(
      canSafelyOverrideBlockedInput(blockedProfile, {
        workerSupported: false,
      }),
    ).toBe(false);

    expect(
      canSafelyOverrideBlockedInput(blockedProfile, {
        workerSupported: true,
        deviceMemory: 2,
        hardwareConcurrency: 8,
      }),
    ).toBe(false);

    expect(
      canSafelyOverrideBlockedInput(blockedProfile, {
        workerSupported: true,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
  });
});
