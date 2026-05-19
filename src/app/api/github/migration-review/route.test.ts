import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const WEBHOOK_SECRET = "test-webhook-secret";

function signPayload(payload: string) {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;
}

function buildRequest({
  payload,
  event = "pull_request",
  signature,
}: {
  payload: string;
  event?: string;
  signature?: string | null;
}) {
  return new Request("http://localhost/api/github/migration-review", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": signature ?? signPayload(payload),
    },
    body: payload,
  });
}

describe("POST /api/github/migration-review", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns 401 when signature is invalid", async () => {
    const response = await POST(
      buildRequest({
        payload: "{}",
        signature: "sha256=deadbeef",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });

  it("returns 401 when webhook secret is unset", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const response = await POST(buildRequest({ payload: "{}" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(buildRequest({ payload: "not-json" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
  });

  it("skips non pull_request events", async () => {
    const response = await POST(
      buildRequest({
        payload: JSON.stringify({ action: "opened" }),
        event: "push",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
  });

  it("returns 503 when GITHUB_TOKEN is missing for pull_request", async () => {
    const response = await POST(
      buildRequest({
        payload: JSON.stringify({
          action: "opened",
          pull_request: { number: 1 },
          repository: { full_name: "acme/repo" },
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("GITHUB_TOKEN"),
    });
  });

  it("does not log raw SQL in error responses", async () => {
    const secretSql = "password 'super-secret-password-123'";
    const response = await POST(buildRequest({ payload: "not-json" }));
    const body = await response.text();

    expect(body).not.toContain(secretSql);
    expect(body).not.toContain(WEBHOOK_SECRET);
  });
});
