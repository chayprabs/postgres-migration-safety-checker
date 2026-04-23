export type ReportDownloadType = "html" | "json" | "markdown";

export type ReportFilenames = {
  html: string;
  json: string;
  markdown: string;
};

const REPORT_FILENAME_BASE = "postgres-migration-safety-report";

function sanitizeFilenameSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function getReportFilenames(sourceFilename?: string | null): ReportFilenames {
  const basename = sourceFilename
    ? sourceFilename.split(/[\\/]/).pop() ?? sourceFilename
    : "";
  const safePrefix = basename ? sanitizeFilenameSegment(basename) : "";
  const base = safePrefix
    ? `${safePrefix}-${REPORT_FILENAME_BASE}`
    : REPORT_FILENAME_BASE;

  return {
    markdown: `${base}.md`,
    html: `${base}.html`,
    json: `${base}.json`,
  };
}

export function downloadTextFile({
  content,
  filename,
  mimeType,
}: {
  content: string;
  filename: string;
  mimeType: string;
}) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export function openPrintReport(html: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const handleLoad = () => {
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    handleLoad();
  } else {
    printWindow.addEventListener("load", handleLoad, { once: true });
  }

  return true;
}
