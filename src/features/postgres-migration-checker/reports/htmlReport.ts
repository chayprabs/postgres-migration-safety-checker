import type { FindingRecipeGroup } from "../analyzer/recipes/types";
import { redactSecretsInText } from "../analyzer/security/secretDetection";
import type { AnalysisResult, Finding } from "../types";
import type { ReportExportInput } from "./types";

function toHeadingCase(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getConfidenceLabel(confidence: Finding["confidence"]) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}

function findStatement(result: AnalysisResult, statementIndex: number) {
  return result.statements.find((statement) => statement.index === statementIndex) ?? null;
}

function findRecipeGroup(
  recipeGroups: readonly FindingRecipeGroup[],
  findingId: string,
) {
  return recipeGroups.find((group) => group.findingId === findingId) ?? null;
}

function getDisplaySqlSnippet(
  sqlSnippet: string,
  redactionMode: boolean,
) {
  return redactionMode ? redactSecretsInText(sqlSnippet) : sqlSnippet;
}

function renderList(items: readonly string[]) {
  return `<ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderSummaryBullets(input: ReportExportInput) {
  const blockingVisibleFindings = input.findings.filter(
    (finding) => finding.lockInfo?.blocksReads || finding.lockInfo?.blocksWrites,
  ).length;

  return renderList([
    `Risk score is ${input.result.summary.risk.score}/100 with label ${input.result.summary.risk.label} across ${input.result.summary.totalStatements} statement(s).`,
    `This report includes ${input.findings.length} finding(s) from the current review view out of ${input.result.findings.length} total finding(s).`,
    `Highest detected lock level is ${input.result.summary.risk.highestLockLevel ?? "None detected"}, and ${blockingVisibleFindings} visible finding(s) appear to block reads or writes.`,
    `The checker generated ${input.recipeGroups.length} safe rewrite recipe group(s) and ${input.parserDiagnostics.length} parser diagnostic(s).`,
  ]);
}

function renderFindingsTable(input: ReportExportInput) {
  if (input.findings.length === 0) {
    return "<p>No findings are included in the current report view.</p>";
  }

  const rows = input.findings
    .map(
      (finding, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(finding.severity.toUpperCase())}</td>
          <td>${escapeHtml(toHeadingCase(finding.category))}</td>
          <td>${finding.statementIndex + 1}</td>
          <td>${escapeHtml(finding.lockLevel ?? "None")}</td>
          <td>${escapeHtml(getConfidenceLabel(finding.confidence))}</td>
          <td>${escapeHtml(finding.title)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Severity</th>
          <th>Category</th>
          <th>Statement</th>
          <th>Lock</th>
          <th>Confidence</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDetailedFindings(input: ReportExportInput) {
  if (input.findings.length === 0) {
    return "<p>No findings are included in the current report view.</p>";
  }

  return input.findings
    .map((finding, index) => {
      const statement = findStatement(input.result, finding.statementIndex);
      const recipeGroup = findRecipeGroup(input.recipeGroups, finding.id);
      const details = [
        `<li><strong>Category:</strong> ${escapeHtml(toHeadingCase(finding.category))}</li>`,
        `<li><strong>Confidence:</strong> ${escapeHtml(
          getConfidenceLabel(finding.confidence),
        )}</li>`,
        `<li><strong>Statement:</strong> ${finding.statementIndex + 1}</li>`,
      ];

      if (finding.lineStart && finding.lineEnd) {
        details.push(
          `<li><strong>Lines:</strong> ${finding.lineStart}-${finding.lineEnd}</li>`,
        );
      }

      if (finding.redactedPreview) {
        details.push(
          `<li><strong>Redacted preview:</strong> <code>${escapeHtml(
            finding.redactedPreview,
          )}</code></li>`,
        );
      }

      if (finding.objectName) {
        details.push(
          `<li><strong>Object:</strong> ${escapeHtml(finding.objectName)}</li>`,
        );
      }

      if (finding.lockLevel) {
        details.push(
          `<li><strong>Lock level:</strong> ${escapeHtml(finding.lockLevel)}</li>`,
        );
      }

      const recipesMarkup = recipeGroup?.recipes.length
        ? recipeGroup.recipes
            .map((recipe) => {
              const recipeWarnings =
                recipe.warnings.length > 0
                  ? `<div class="subsection"><p class="eyebrow">Warnings</p>${renderList(
                      recipe.warnings,
                    )}</div>`
                  : "";

              return `
                <div class="recipe-card">
                  <h5>${escapeHtml(recipe.title)}</h5>
                  <p>${escapeHtml(recipe.description)}</p>
                  <ol>${recipe.steps
                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                    .join("")}</ol>
                  ${
                    recipe.sqlSnippet
                      ? `<pre><code>${escapeHtml(
                          getDisplaySqlSnippet(
                            recipe.sqlSnippet,
                            input.options.redactionMode,
                          ),
                        )}</code></pre>`
                      : `<p>No automatic SQL snippet is suggested for this recipe.</p>`
                  }
                  ${
                    recipe.frameworkSnippet
                      ? `<p><strong>Framework guidance:</strong> ${escapeHtml(
                          recipe.frameworkSnippet,
                        )}</p>`
                      : ""
                  }
                  ${recipeWarnings}
                </div>`
            })
            .join("")
        : finding.safeRewrite
          ? `<div class="recipe-card">
              <h5>${escapeHtml(finding.safeRewrite.title)}</h5>
              <p>${escapeHtml(finding.safeRewrite.summary)}</p>
              <pre><code>${escapeHtml(
                getDisplaySqlSnippet(
                  finding.safeRewrite.sql,
                  input.options.redactionMode,
                ),
              )}</code></pre>
            </div>`
          : "";

      const statementMarkup =
        input.options.includeSqlSnippets && statement
          ? `<div class="subsection"><p class="eyebrow">Statement snippet</p><pre><code>${escapeHtml(
              getDisplaySqlSnippet(
                statement.raw,
                input.options.redactionMode,
              ),
            )}</code></pre></div>`
          : "";

      const docsMarkup =
        finding.docsLinks.length > 0
          ? `<div class="subsection"><p class="eyebrow">Docs</p><ul>${finding.docsLinks
              .map(
                (link) =>
                  `<li><a href="${escapeHtml(link.href)}">${escapeHtml(
                    link.label,
                  )}</a></li>`,
              )
              .join("")}</ul></div>`
          : "";

      return `
        <article class="finding">
          <h3>${index + 1}. [${escapeHtml(finding.severity.toUpperCase())}] ${escapeHtml(
            finding.title,
          )}</h3>
          <ul>${details.join("")}</ul>
          <p>${escapeHtml(finding.summary)}</p>
          <div class="subsection">
            <p class="eyebrow">Why it matters</p>
            <p>${escapeHtml(finding.whyItMatters)}</p>
          </div>
          <div class="subsection">
            <p class="eyebrow">Recommended action</p>
            <p>${escapeHtml(finding.recommendedAction)}</p>
          </div>
          ${statementMarkup}
          ${recipesMarkup}
          ${docsMarkup}
        </article>`;
    })
    .join("");
}

function renderSafeRewriteSection(input: ReportExportInput) {
  if (input.recipeGroups.length === 0) {
    return "<p>No safe rewrite recipes are included in the current report view.</p>";
  }

  return input.recipeGroups
    .map(
      (group) => `
        <article class="finding">
          <h3>${escapeHtml(group.title)}</h3>
          ${group.recipes
            .map(
              (recipe) => `
                <div class="recipe-card">
                  <h4>${escapeHtml(recipe.title)}</h4>
                  <p>${escapeHtml(recipe.description)}</p>
                  <ol>${recipe.steps
                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                    .join("")}</ol>
                  ${
                    recipe.sqlSnippet
                      ? `<pre><code>${escapeHtml(
                          getDisplaySqlSnippet(
                            recipe.sqlSnippet,
                            input.options.redactionMode,
                          ),
                        )}</code></pre>`
                      : `<p>No automatic SQL snippet is suggested for this recipe.</p>`
                  }
                </div>`,
            )
            .join("")}
        </article>`,
    )
    .join("");
}

export function createHtmlReport(input: ReportExportInput) {
  const generatedAt = input.options.generatedAt ?? new Date().toISOString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PostgreSQL Migration Safety Report</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", ui-sans-serif, sans-serif;
      }
      body {
        margin: 0;
        background: #f5f2ea;
        color: #1e293b;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1, h2, h3, h4, h5, p, ul, ol {
        margin-top: 0;
      }
      .card {
        background: #fffdf8;
        border: 1px solid #d9d3c4;
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 18px;
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
      }
      .grid {
        display: grid;
        gap: 14px;
      }
      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        border: 1px solid #d9d3c4;
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #f2ede2;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        background: #f7f4ec;
        border: 1px solid #d9d3c4;
        border-radius: 16px;
        padding: 14px;
        font-size: 12px;
        line-height: 1.6;
      }
      .finding + .finding {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid #d9d3c4;
      }
      .recipe-card {
        background: #f7f4ec;
        border: 1px solid #d9d3c4;
        border-radius: 18px;
        padding: 16px;
        margin-top: 14px;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #6b7280;
        margin-bottom: 6px;
      }
      a {
        color: #0f766e;
      }
      @media print {
        body {
          background: #ffffff;
        }
        main {
          max-width: none;
          padding: 0;
        }
        .card {
          box-shadow: none;
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>PostgreSQL Migration Safety Report</h1>
        <p>Generated: ${escapeHtml(formatTimestamp(generatedAt))}</p>
        <div class="grid two">
          <div>
            <p><strong>PostgreSQL version:</strong> ${input.postgresVersion}</p>
            <p><strong>Framework preset:</strong> ${escapeHtml(
              `${input.frameworkLabel} (${input.frameworkPreset})`,
            )}</p>
            <p><strong>Table size profile:</strong> ${escapeHtml(
              toHeadingCase(input.tableSizeProfile),
            )}</p>
          </div>
          <div>
            <p><strong>Risk score:</strong> ${input.result.summary.risk.score}/100 (${escapeHtml(
              input.result.summary.risk.label,
            )})</p>
            <p><strong>Highest lock level:</strong> ${escapeHtml(
              input.result.summary.risk.highestLockLevel ?? "None detected",
            )}</p>
            <p><strong>Include SQL snippets:</strong> ${
              input.options.includeSqlSnippets ? "Yes" : "No"
            }</p>
            <p><strong>Redaction mode:</strong> ${
              input.options.redactionMode ? "On" : "Off"
            }</p>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Severity counts</h2>
        <div class="grid two">
          <p><strong>Critical:</strong> ${input.result.summary.bySeverity.critical}</p>
          <p><strong>High:</strong> ${input.result.summary.bySeverity.high}</p>
          <p><strong>Medium:</strong> ${input.result.summary.bySeverity.medium}</p>
          <p><strong>Low:</strong> ${input.result.summary.bySeverity.low}</p>
          <p><strong>Info:</strong> ${input.result.summary.bySeverity.info}</p>
        </div>
      </section>

      <section class="card">
        <h2>Summary</h2>
        ${renderSummaryBullets(input)}
      </section>

      <section class="card">
        <h2>Review filters</h2>
        ${renderList([
          `Severity filter: ${toHeadingCase(input.viewFilters.severityFilter)}`,
          `Category filter: ${toHeadingCase(input.viewFilters.categoryFilter)}`,
          `Show only blocking risks: ${input.viewFilters.showOnlyBlockingRisks ? "Yes" : "No"}`,
          `Show safe rewrites only: ${input.viewFilters.showSafeRewritesOnly ? "Yes" : "No"}`,
          `Show low severity: ${input.viewFilters.showLowSeverity ? "Yes" : "No"}`,
          `Sort mode: ${toHeadingCase(input.viewFilters.sortMode)}`,
        ])}
      </section>

      <section class="card">
        <h2>Findings table</h2>
        ${renderFindingsTable(input)}
      </section>

      <section class="card">
        <h2>Detailed findings</h2>
        ${renderDetailedFindings(input)}
      </section>

      <section class="card">
        <h2>Safe rewrite recipes</h2>
        ${renderSafeRewriteSection(input)}
      </section>

      <section class="card">
        <h2>Limitations</h2>
        ${renderList(input.result.metadata.limitations)}
      </section>

      <section class="card">
        <h2>Privacy</h2>
        ${renderList([
          "Generated locally in the browser.",
          input.options.includeSqlSnippets
            ? input.options.redactionMode
              ? "Settings links never include your migration SQL. SQL snippets in this export were redacted for likely secrets."
              : "Settings links never include your migration SQL. SQL snippets were explicitly included in this export."
            : "Settings links never include your migration SQL. SQL snippets were omitted from this export by default.",
        ])}
      </section>
    </main>
  </body>
</html>`;
}
