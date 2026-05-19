import { runAnalysisPipeline } from "@authos/pg-migration-analyzer";
import "./content.css";

const PANEL_ID = "authos-migration-checker-panel";

function readSqlFromGithubBlob(): string | null {
  const code = document.querySelector<HTMLElement>(".blob-wrapper table, .highlight table");

  if (!code) {
    return null;
  }

  const lines = [...code.querySelectorAll("tr")].map((row) => {
    const cell = row.querySelector("td.blob-code, td:nth-child(2)");
    return cell?.textContent?.replace(/\u00a0/g, " ") ?? "";
  });

  const sql = lines.join("\n").trim();
  return sql.length > 0 ? sql : null;
}

function getSiteOrigin() {
  return "http://localhost:3000";
}

async function analyzeVisibleSql(sql: string) {
  return runAnalysisPipeline({
    sql,
    settings: {
      postgresVersion: 16,
      frameworkPreset: "raw-sql",
      tableSizeProfile: "large",
      includeLowSeverityFindings: false,
      includeInfoFindings: false,
      includeSafeRewrites: false,
      assumeOnlineMigration: true,
      assumeRunsInTransaction: false,
      transactionAssumptionMode: "auto",
      flagDestructiveChanges: true,
      redactionMode: true,
      autoAnalyze: false,
      reportFormat: "markdown",
      stopAfterParseError: false,
    },
    runtime: { mode: "main-thread" },
  });
}

function renderPanel() {
  if (document.getElementById(PANEL_ID)) {
    return;
  }

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <header><strong>Authos migration check</strong></header>
    <p class="authos-muted">Local analysis for this SQL file. Nothing is uploaded.</p>
    <button type="button" id="authos-analyze-btn">Analyze migration</button>
    <div id="authos-results" class="authos-results" hidden></div>
    <a id="authos-open-link" href="#" target="_blank" rel="noreferrer">Open checker (settings only)</a>
  `;

  document.body.appendChild(panel);

  const analyzeButton = panel.querySelector<HTMLButtonElement>("#authos-analyze-btn");
  const results = panel.querySelector<HTMLDivElement>("#authos-results");
  const openLink = panel.querySelector<HTMLAnchorElement>("#authos-open-link");

  if (openLink) {
    openLink.href = `${getSiteOrigin()}/tools/postgres-migration-safety-checker#share:pg=16&fw=raw-sql&size=large&sev=all&cat=all&blocking=0&rewrites=0&sort=severity&low=1&tab=findings`;
  }

  analyzeButton?.addEventListener("click", () => {
    void (async () => {
      const sql = readSqlFromGithubBlob();

      if (!sql || !results) {
        return;
      }

      results.hidden = false;
      results.textContent = "Analyzing…";

      try {
        const analysis = await analyzeVisibleSql(sql);
        const topFindings = analysis.findings.slice(0, 5);

        results.innerHTML = `
          <p>Risk score: <strong>${analysis.summary.risk.score}/100</strong> (${analysis.summary.risk.label})</p>
          <ul>
            ${topFindings
              .map(
                (finding) =>
                  `<li>[${finding.severity}] ${finding.title}</li>`,
              )
              .join("")}
          </ul>
        `;
      } catch {
        results.textContent = "Analysis failed in this tab.";
      }
    })();
  });
}

renderPanel();
