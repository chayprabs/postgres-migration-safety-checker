import { runAnalysisPipeline } from "@pg-migration-checker/analyzer";
import "./content.css";

const PANEL_ID = "pg-migration-checker-panel";

function readSqlFromGithubBlob(): string | null {
  const code = document.querySelector<HTMLElement>(".blob-wrapper table, .highlight table");
  if (!code) return null;
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
  if (document.getElementById(PANEL_ID)) return;
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <header><strong>Migration safety check</strong></header>
    <p class="pg-muted">Local analysis for this SQL file. Nothing is uploaded.</p>
    <button type="button" id="pg-analyze-btn">Analyze migration</button>
    <div id="pg-results" class="pg-results" hidden></div>
    <a id="pg-open-link" href="#" target="_blank" rel="noreferrer">Open full checker</a>
  `;
  document.body.appendChild(panel);
  const analyzeButton = panel.querySelector<HTMLButtonElement>("#pg-analyze-btn");
  const results = panel.querySelector<HTMLDivElement>("#pg-results");
  const openLink = panel.querySelector<HTMLAnchorElement>("#pg-open-link");
  if (openLink) {
    openLink.href = `${getSiteOrigin()}/#share:pg=16&fw=raw-sql&size=large&sev=all&cat=all&blocking=0&rewrites=0&sort=severity&low=1&tab=findings`;
  }
  analyzeButton?.addEventListener("click", () => {
    void (async () => {
      const sql = readSqlFromGithubBlob();
      if (!sql || !results) return;
      results.hidden = false;
      results.textContent = "Analyzing…";
      try {
        const analysis = await analyzeVisibleSql(sql);
        const topFindings = analysis.findings.slice(0, 5);
        results.innerHTML = `
          <p>Risk score: <strong>${analysis.summary.risk.score}/100</strong> (${analysis.summary.risk.label})</p>
          <ul>
            ${topFindings.map((f) => `<li>[${f.severity}] ${f.title}</li>`).join("")}
          </ul>
        `;
      } catch {
        results.textContent = "Analysis failed in this tab.";
      }
    })();
  });
}

renderPanel();
