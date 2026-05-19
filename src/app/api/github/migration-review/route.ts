import { createHmac, timingSafeEqual } from "node:crypto";
import { runAnalysisPipeline } from "@authos/pg-migration-analyzer";
import type { AnalysisSettings } from "@authos/pg-migration-analyzer";

export const runtime = "nodejs";

type PullRequestFile = {
  filename: string;
  status: string;
  patch?: string;
};

function verifyGithubSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const digest = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expected = Buffer.from(digest);
  const received = Buffer.from(signatureHeader);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function extractSqlFromPatch(patch?: string) {
  if (!patch) {
    return "";
  }

  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n")
    .trim();
}

async function postPullRequestComment({
  owner,
  repo,
  pullNumber,
  body,
}: {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return;
  }

  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );
}

const defaultSettings: AnalysisSettings = {
  postgresVersion: 16,
  frameworkPreset: "raw-sql",
  tableSizeProfile: "large",
  includeLowSeverityFindings: true,
  includeInfoFindings: true,
  includeSafeRewrites: false,
  assumeOnlineMigration: true,
  assumeRunsInTransaction: false,
  transactionAssumptionMode: "auto",
  flagDestructiveChanges: true,
  redactionMode: true,
  autoAnalyze: false,
  reportFormat: "markdown",
  stopAfterParseError: false,
};

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyGithubSignature(payload, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  let body: {
    action?: string;
    pull_request?: { number: number };
    repository?: { full_name: string };
  };

  try {
    body = JSON.parse(payload) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (event !== "pull_request" || body.action !== "opened" && body.action !== "synchronize") {
    return Response.json({ ok: true, skipped: true });
  }

  const pullNumber = body.pull_request?.number;
  const fullName = body.repository?.full_name;

  if (!pullNumber || !fullName) {
    return Response.json({ error: "Missing pull request metadata" }, { status: 400 });
  }

  const [owner, repo] = fullName.split("/");
  const installationToken = process.env.GITHUB_TOKEN;

  if (!installationToken) {
    return Response.json(
      { error: "GITHUB_TOKEN is required to fetch changed files" },
      { status: 503 },
    );
  }

  const filesResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!filesResponse.ok) {
    return Response.json({ error: "Failed to load pull request files" }, { status: 502 });
  }

  const files = (await filesResponse.json()) as PullRequestFile[];
  const sqlFiles = files.filter(
    (file) => file.filename.endsWith(".sql") && file.status !== "removed",
  );

  if (sqlFiles.length === 0) {
    await postPullRequestComment({
      owner,
      repo,
      pullNumber,
      body: "PostgreSQL Migration Safety Checker: no `.sql` migration files changed in this pull request.",
    });
    return Response.json({ ok: true, analyzed: 0 });
  }

  const summaries: string[] = [];

  for (const file of sqlFiles) {
    const sql = extractSqlFromPatch(file.patch);

    if (!sql) {
      continue;
    }

    const result = await runAnalysisPipeline({
      sql,
      settings: defaultSettings,
      sourceFilename: file.filename,
      runtime: { mode: "main-thread" },
    });

    const critical = result.summary.bySeverity.critical ?? 0;
    const high = result.summary.bySeverity.high ?? 0;

    summaries.push(
      `### \`${file.filename}\`\n- Risk score: **${result.summary.risk.score}/100** (${result.summary.risk.label})\n- Findings: ${result.findings.length} (critical: ${critical}, high: ${high})`,
    );
  }

  const comment = [
    "## PostgreSQL Migration Safety Checker",
    "",
    "Automated review of changed SQL migration files (patch additions only).",
    "",
    ...summaries,
    "",
    "_Generated by Authos migration review webhook. SQL content is not logged._",
  ].join("\n");

  await postPullRequestComment({ owner, repo, pullNumber, body: comment });

  return Response.json({ ok: true, analyzed: summaries.length });
}
