import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const TOOL_PATH = "/tools/postgres-migration-safety-checker";
const FAKE_GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz123456";
const UNIQUE_SQL_SENTINEL = "UNIQUE_SQL_SENTINEL_8675309";

const SAMPLE_NAMES = {
  concurrentIndex: /Concurrent index inside a transaction/i,
  unsafeAddDefaultAndIndex: /Add defaulted column and blocking index/i,
} as const;

const FINDING_TITLES = {
  addColumnDefault:
    /ADD COLUMN with DEFAULT is version- and expression-sensitive/i,
  concurrentIndexInTransaction:
    /CREATE INDEX CONCURRENTLY cannot run inside a transaction block/i,
  createIndexWithoutConcurrently:
    /CREATE INDEX without CONCURRENTLY can block writes/i,
  secretDetected: /Possible secret detected in migration input/i,
} as const;

const LEGACY_DEFAULT_SUMMARY =
  "On PostgreSQL 10 and earlier, adding a column with a default usually rewrites the table";
const MODERN_DEFAULT_SUMMARY =
  "On PostgreSQL 11+, many non-volatile ADD COLUMN ... DEFAULT changes use a fast metadata-only path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let clipboardText = "";

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          clipboardText = text;
          (
            window as typeof window & { __playwrightClipboard?: string }
          ).__playwrightClipboard = text;
        },
        readText: async () => clipboardText,
      },
    });
  });

  await page.goto(TOOL_PATH);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /PostgreSQL Migration Safety Checker/i,
    }),
  ).toBeVisible();
});

test("page loads with the core workspace UI", async ({ page }) => {
  await expect(
    page.getByText(
      /Local-first: your SQL is analyzed in this browser\. Authos does not upload or store migration contents\./i,
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Migration SQL editor")).toBeVisible();
});

test("loads the unsafe example and analyzes blocking migration risks", async ({
  page,
}) => {
  await loadExample(page, SAMPLE_NAMES.unsafeAddDefaultAndIndex);
  await runDesktopAnalysis(page);

  await expect(page.getByText("Risk score")).toBeVisible();
  await expect(
    page.getByLabel(/critical severity|high severity/i).first(),
  ).toBeVisible();
  await expect(
    page.getByText(FINDING_TITLES.createIndexWithoutConcurrently),
  ).toBeVisible();
  await openFindingDetails(page, FINDING_TITLES.createIndexWithoutConcurrently);
  await expect(page.getByLabel("Statement SQL preview")).toContainText(
    "CREATE INDEX index_users_on_email ON users(email)",
  );
});

test("changes PostgreSQL version copy for ADD COLUMN DEFAULT analysis", async ({
  page,
}) => {
  await disableAutoAnalyze(page);
  await loadExample(page, SAMPLE_NAMES.unsafeAddDefaultAndIndex);
  await page.getByLabel("PostgreSQL version").selectOption("10");
  await runDesktopAnalysis(page);
  await openFindingDetails(page, FINDING_TITLES.addColumnDefault);

  await expect(page.getByText(LEGACY_DEFAULT_SUMMARY).last()).toBeVisible();

  await page.getByLabel("PostgreSQL version").selectOption("16");
  await runDesktopAnalysis(page);
  await openFindingDetails(page, FINDING_TITLES.addColumnDefault);

  await expect(page.getByText(MODERN_DEFAULT_SUMMARY).last()).toBeVisible();
  await expect(page.getByText(LEGACY_DEFAULT_SUMMARY).last()).not.toBeVisible();
});

test("shows Rails-specific transaction guidance for concurrent indexes", async ({
  page,
}) => {
  await disableAutoAnalyze(page);
  await page.getByLabel("Framework preset").selectOption("rails");
  await loadExample(page, SAMPLE_NAMES.concurrentIndex);
  await runDesktopAnalysis(page);

  await expect(
    page.getByLabel("Findings list").getByText(
      FINDING_TITLES.concurrentIndexInTransaction,
    ),
  ).toBeVisible();
  await openFindingDetails(page, FINDING_TITLES.concurrentIndexInTransaction);
  await expect(
    page.getByText(
      "Add disable_ddl_transaction! to the migration class before concurrent index operations.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Rails is being analyzed with a transaction wrapper assumption.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("copies and downloads the Markdown report", async ({ page }) => {
  await disableAutoAnalyze(page);
  await loadExample(page, SAMPLE_NAMES.unsafeAddDefaultAndIndex);
  await runDesktopAnalysis(page);

  await page.getByRole("button", { name: "Copy Markdown report" }).click();
  await expectStatusMessage(page, "Copied Markdown report");

  const clipboardText = await readClipboard(page);
  expect(clipboardText).toContain("# PostgreSQL Migration Safety Report");
  expect(clipboardText).toContain("Risk score:");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(
    /postgres-migration-safety-report\.md$/i,
  );
  expect(downloadPath).toBeTruthy();

  const downloadedReport = await readFile(downloadPath!, "utf8");
  expect(downloadedReport).toContain("# PostgreSQL Migration Safety Report");
  expect(downloadedReport).toContain("## Detailed Findings");
});

test("detects secrets and redacts statement previews when redaction mode is enabled", async ({
  page,
}) => {
  await disableAutoAnalyze(page);
  await replaceEditorContent(
    page,
    `ALTER TABLE users ADD COLUMN api_token text DEFAULT '${FAKE_GITHUB_TOKEN}';`,
  );
  await runDesktopAnalysis(page);
  await openFindingDetails(page, FINDING_TITLES.secretDetected);

  await page
    .getByRole("checkbox", {
      name: /^Redaction mode\b/i,
    })
    .check();

  const statementPreview = page.getByLabel("Statement SQL preview");
  await expect(
    page.getByText(/Likely secrets are masked in this preview because redaction mode is on\./i),
  ).toBeVisible();
  await expect(statementPreview).toContainText("[REDACTED_GITHUB_TOKEN]");
  await expect(statementPreview).not.toContainText(FAKE_GITHUB_TOKEN);
});

test.describe("mobile viewport", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });

  test("uses the mobile action bar and results tabs", async ({ page }) => {
    const analyzeButton = page.getByRole("button", { name: /^Analyze$/ });
    const examplesButtons = page.getByRole("button", { name: /^Examples$/ });

    await expect(analyzeButton).toBeVisible();
    await expect(examplesButtons.last()).toBeVisible();

    await examplesButtons.last().click();
    await page.getByRole("button", { name: SAMPLE_NAMES.unsafeAddDefaultAndIndex }).click();
    await runMobileAnalysis(page);

    await expect(page.getByText("Risk score")).toBeVisible();
    await page.getByRole("tab", { name: "Safe rewrites" }).click();
    await expect(
      page.getByRole("tabpanel", { name: "Safe rewrites" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Findings" }).click();
    await expect(page.getByRole("tabpanel", { name: "Findings" })).toBeVisible();
  });
});

test("settings links never include pasted SQL", async ({ page }) => {
  await replaceEditorContent(
    page,
    `SELECT '${UNIQUE_SQL_SENTINEL}' AS sentinel_value;`,
  );

  await page.getByRole("button", { name: "Copy settings link" }).click();
  await expect(page.getByRole("status")).toContainText("Copied settings link");

  const copiedLink = await readClipboard(page);

  expect(copiedLink).toContain("#share:");
  expect(copiedLink).not.toContain(UNIQUE_SQL_SENTINEL);
});

async function loadExample(page: Page, sampleName: RegExp) {
  await page.getByRole("button", { name: /^Examples$/ }).first().click();
  await page.getByRole("button", { name: sampleName }).click();
}

async function runDesktopAnalysis(page: Page) {
  const runButton = page.getByRole("button", { name: "Run local analysis" });

  if (await runButton.isEnabled()) {
    await runButton.click();
  }

  await expect(page.getByText("Risk score")).toBeVisible({
    timeout: 15_000,
  });
}

async function runMobileAnalysis(page: Page) {
  const analyzeButton = page.getByRole("button", { name: /^Analyze$/ });

  if (await analyzeButton.isEnabled()) {
    await analyzeButton.click();
  }

  await expect(page.getByText("Risk score")).toBeVisible({
    timeout: 15_000,
  });
}

async function disableAutoAnalyze(page: Page) {
  const autoAnalyze = page.getByLabel("Auto analyze");

  if (await autoAnalyze.isChecked()) {
    await autoAnalyze.uncheck();
  }
}

async function replaceEditorContent(page: Page, sql: string) {
  const editor = page.getByLabel("Migration SQL editor");

  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await page.keyboard.insertText(sql);

  await expect(editor).toContainText(sql);
}

async function openFindingDetails(page: Page, title: RegExp) {
  const card = page
    .getByLabel("Findings list")
    .locator(":scope > *")
    .filter({
      has: page.getByText(title),
    })
    .first();

  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "View details" }).click();
  await expect(page.getByText("Statement preview", { exact: true })).toBeVisible();
}

async function expectStatusMessage(page: Page, text: string) {
  await expect(
    page.getByRole("status").filter({
      hasText: text,
    }),
  ).toBeVisible();
}

async function readClipboard(page: Page) {
  return page.evaluate(() => {
    return (
      (window as typeof window & { __playwrightClipboard?: string })
        .__playwrightClipboard ?? ""
    );
  });
}
