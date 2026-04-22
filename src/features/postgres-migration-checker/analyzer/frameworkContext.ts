import {
  getFrameworkPresetDefinition,
  type FrameworkPresetDefinition,
} from "../constants/frameworkPresets";
import type {
  AnalysisSettings,
  FrameworkAnalysisMetadata,
  FrameworkPreset,
} from "../types";

type BuildFrameworkAnalysisMetadataInput = {
  settings: AnalysisSettings;
  sql: string;
  sourceFilename?: string;
};

type FrameworkDetection = {
  detectedPreset: FrameworkPreset;
  label: string;
  disablesTransactions?: boolean;
};

function trimSignalLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function pushDetection(
  detections: FrameworkDetection[],
  detectedPreset: FrameworkPreset,
  label: string,
  disablesTransactions = false,
) {
  detections.push({
    detectedPreset,
    disablesTransactions,
    label: trimSignalLabel(label),
  });
}

function detectSqlFrameworkSignals(sql: string, sourceFilename?: string) {
  const detections: FrameworkDetection[] = [];

  if (/disable_ddl_transaction!/i.test(sql)) {
    pushDetection(
      detections,
      "rails",
      "Detected disable_ddl_transaction! in the migration content.",
      true,
    );
  }

  if (/^\s*--\s*\+goose\s+NO\s+TRANSACTION\b/im.test(sql)) {
    pushDetection(
      detections,
      "goose",
      "Detected -- +goose NO TRANSACTION annotation.",
      true,
    );
  }

  if (/^\s*--\s*\+goose\s+(Up|Down)\b/im.test(sql)) {
    pushDetection(
      detections,
      "goose",
      "Detected Goose Up/Down migration annotations.",
    );
  }

  if (
    /^\s*--\s*liquibase\s+formatted\s+sql\b/im.test(sql) ||
    /^\s*--\s*changeset\b/im.test(sql)
  ) {
    pushDetection(
      detections,
      "liquibase",
      "Detected Liquibase formatted SQL comments.",
    );
  }

  if (/runInTransaction\s*[:=]\s*false/i.test(sql)) {
    pushDetection(
      detections,
      "liquibase",
      "Detected Liquibase runInTransaction:false configuration.",
      true,
    );
  }

  if (sourceFilename) {
    const normalizedFilename = sourceFilename.replace(/\\/g, "/");

    if (/\/db\/migrate\/.+\.(rb|sql)$/i.test(normalizedFilename)) {
      pushDetection(
        detections,
        "rails",
        `Source filename ${sourceFilename} looks like a Rails migration path.`,
      );
    }

    if (/\/prisma\/migrations\/.+\/migration\.sql$/i.test(normalizedFilename)) {
      pushDetection(
        detections,
        "prisma",
        `Source filename ${sourceFilename} looks like a Prisma migration file.`,
      );
    }

    if (
      /(?:^|\/)(?:V\d+(?:[._]\d+)*__.+|R__.+)\.sql$/i.test(normalizedFilename)
    ) {
      pushDetection(
        detections,
        "flyway",
        `Source filename ${sourceFilename} matches a Flyway SQL migration pattern.`,
      );
    }
  }

  return detections;
}

function getTransactionReason(
  definition: FrameworkPresetDefinition,
  effectiveAssumeTransaction: boolean,
) {
  return effectiveAssumeTransaction
    ? `${definition.label} is being analyzed with a transaction wrapper assumption.`
    : `${definition.label} is being analyzed without a transaction wrapper assumption.`;
}

export function buildFrameworkAnalysisMetadata({
  settings,
  sql,
  sourceFilename,
}: BuildFrameworkAnalysisMetadataInput): FrameworkAnalysisMetadata {
  const definition = getFrameworkPresetDefinition(settings.frameworkPreset);
  const detections = detectSqlFrameworkSignals(sql, sourceFilename);
  const selectedPresetDetections = detections.filter(
    (detection) => detection.detectedPreset === settings.frameworkPreset,
  );
  const matchingTransactionDisableDetection =
    selectedPresetDetections.find((detection) => detection.disablesTransactions) ??
    null;
  const manualOverride = settings.transactionAssumptionMode !== "auto";
  const transactionDisableDetected = matchingTransactionDisableDetection !== null;

  let effectiveAssumeTransaction = settings.assumeRunsInTransaction;
  let transactionAssumptionReason = getTransactionReason(
    definition,
    effectiveAssumeTransaction,
  );
  let transactionAssumptionSource: FrameworkAnalysisMetadata["transactionAssumptionSource"] =
    manualOverride ? "user-override" : "framework-default";

  if (manualOverride) {
    transactionAssumptionReason =
      settings.transactionAssumptionMode === "force-transaction"
        ? "You manually forced the migration review into a transaction-wrapped assumption."
        : "You manually forced the migration review into a non-transactional assumption.";
  } else if (transactionDisableDetected) {
    effectiveAssumeTransaction = false;
    transactionAssumptionSource = "framework-comment";
    transactionAssumptionReason = matchingTransactionDisableDetection.label;
  }

  return {
    preset: settings.frameworkPreset,
    label: definition.label,
    description: definition.description,
    sourceFilename,
    assumeTransactionDefault: definition.assumeTransactionDefault,
    effectiveAssumeTransaction,
    transactionAssumptionMode: settings.transactionAssumptionMode,
    transactionAssumptionSource,
    transactionAssumptionReason,
    transactionDisableDetected,
    transactionDisableHint: definition.transactionDisableHint,
    commonMigrationFilePatterns: [...definition.commonMigrationFilePatterns],
    commonRisks: [...definition.commonRisks],
    safeIndexAdvice: definition.safeIndexAdvice,
    safeConstraintAdvice: definition.safeConstraintAdvice,
    docsLinks: [...definition.docsLinks],
    migrationReviewChecklist: [...definition.migrationReviewChecklist],
    detectedSignals: [...new Set(detections.map((detection) => detection.label))],
  };
}

export function appendFrameworkAdvice(baseText: string, advice?: string) {
  if (!advice) {
    return baseText;
  }

  return `${baseText} ${advice}`;
}
