import type {
  ConfidenceLevel,
  DocumentationLink,
  Finding,
  FindingSeverity,
  MigrationStatement,
} from "../../types";
import {
  buildSqlSourceIndex,
  locateSourcePosition,
} from "../splitSqlStatements";

type SecretPattern = {
  confidence: ConfidenceLevel;
  id: string;
  label: string;
  preview: (match: RegExpExecArray) => string;
  priority: number;
  redact: (match: RegExpExecArray) => string;
  regex: RegExp;
  severity: FindingSeverity;
};

export type SecretRedactionMatch = {
  confidence: ConfidenceLevel;
  endOffset: number;
  id: string;
  label: string;
  redactedPreview: string;
  replacement: string;
  severity: FindingSeverity;
  startOffset: number;
};

export const SECRET_DETECTION_RULE_ID = "PGM900_POSSIBLE_SECRET_IN_INPUT";

const SECRET_DETECTION_DOCS: DocumentationLink[] = [
  {
    label: "How privacy works",
    href: "/privacy",
    description:
      "Authos privacy details for the PostgreSQL Migration Safety Checker.",
  },
];

function buildAssignmentReplacement(name: string, separator: string, marker: string) {
  return `${name}${separator}'${marker}'`;
}

function buildPasswordAssignmentPreview(match: RegExpExecArray) {
  return buildAssignmentReplacement(match[1] ?? "password", match[2] ?? " = ", "REDACTED_PASSWORD");
}

function buildGenericAssignmentPreview(match: RegExpExecArray) {
  const secretName = match[1] ?? "token";
  const separator = match[2] ?? " = ";
  const marker = `REDACTED_${secretName.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;

  return buildAssignmentReplacement(secretName, separator, marker);
}

function buildMaskedPrefixPreview(value: string, marker: string) {
  const prefix = value.slice(0, Math.min(4, value.length));
  return `${prefix}...[${marker}]`;
}

function buildPreviewFromScheme(schemeWithAuthorityPrefix: string, marker: string) {
  const scheme = schemeWithAuthorityPrefix.split("://")[0] ?? "database";
  return `${scheme}://...:[${marker}]@...`;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "private-key-block",
    label: "private key material",
    severity: "high",
    confidence: "high",
    priority: 100,
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    redact: () =>
      [
        "-----BEGIN [REDACTED PRIVATE KEY]-----",
        "[REDACTED PRIVATE KEY MATERIAL]",
        "-----END [REDACTED PRIVATE KEY]-----",
      ].join("\n"),
    preview: () => "-----BEGIN [REDACTED PRIVATE KEY]-----",
  },
  {
    id: "database-url-with-password",
    label: "database URL with an embedded password",
    severity: "high",
    confidence: "high",
    priority: 95,
    regex:
      /\b((?:postgres(?:ql)?|mysql(?:\+[A-Za-z0-9_-]+)?|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\/[^/\s:@]+:)([^@\s/]+)(@[^ "'\r\n]+)/gi,
    redact: (match) =>
      `${match[1] ?? ""}[REDACTED_PASSWORD]${match[3] ?? ""}`,
    preview: (match) => buildPreviewFromScheme(match[1] ?? "database://", "REDACTED_PASSWORD"),
  },
  {
    id: "sql-password-literal",
    label: "SQL password literal",
    severity: "high",
    confidence: "high",
    priority: 92,
    regex:
      /\bPASSWORD\b(\s+)('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*")/gi,
    redact: (match) => `PASSWORD${match[1] ?? " "}'[REDACTED_PASSWORD]'`,
    preview: () => "PASSWORD '[REDACTED_PASSWORD]'",
  },
  {
    id: "password-assignment",
    label: "password assignment",
    severity: "high",
    confidence: "medium",
    priority: 90,
    regex:
      /\b(password)\b(\s*[=:]\s*)('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|[^\s,;]+)/gi,
    redact: (match) => buildPasswordAssignmentPreview(match),
    preview: (match) => buildPasswordAssignmentPreview(match),
  },
  {
    id: "slack-token",
    label: "Slack token-like value",
    severity: "high",
    confidence: "high",
    priority: 88,
    regex: /\bxox(?:a|b|p|o|s|r)-[A-Za-z0-9-]{10,}\b/g,
    redact: () => "[REDACTED_SLACK_TOKEN]",
    preview: () => "[REDACTED_SLACK_TOKEN]",
  },
  {
    id: "github-token",
    label: "GitHub token-like value",
    severity: "high",
    confidence: "high",
    priority: 86,
    regex: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/g,
    redact: () => "[REDACTED_GITHUB_TOKEN]",
    preview: () => "[REDACTED_GITHUB_TOKEN]",
  },
  {
    id: "stripe-token",
    label: "Stripe token-like value",
    severity: "high",
    confidence: "high",
    priority: 84,
    regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    redact: () => "[REDACTED_STRIPE_TOKEN]",
    preview: () => "[REDACTED_STRIPE_TOKEN]",
  },
  {
    id: "aws-access-key",
    label: "AWS access key",
    severity: "high",
    confidence: "high",
    priority: 82,
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    redact: () => "[REDACTED_AWS_ACCESS_KEY]",
    preview: (match) =>
      buildMaskedPrefixPreview(match[0] ?? "AWSK", "REDACTED_AWS_ACCESS_KEY"),
  },
  {
    id: "jwt",
    label: "JWT-like token",
    severity: "medium",
    confidence: "medium",
    priority: 80,
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    redact: () => "[REDACTED_JWT]",
    preview: () => "[REDACTED_JWT]",
  },
  {
    id: "api-key-assignment",
    label: "API key or token assignment",
    severity: "medium",
    confidence: "medium",
    priority: 70,
    regex:
      /\b(api[_-]?key|access[_-]?token|token|secret|client[_-]?secret|auth[_-]?token)\b(\s*[=:]\s*)('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|[A-Za-z0-9_+=/.-]{12,})/gi,
    redact: (match) => buildGenericAssignmentPreview(match),
    preview: (match) => buildGenericAssignmentPreview(match),
  },
] as const;

function getSeverityRank(severity: FindingSeverity) {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
  }
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function collectPatternMatches(
  text: string,
  pattern: SecretPattern,
): SecretRedactionMatch[] {
  const matches: SecretRedactionMatch[] = [];
  pattern.regex.lastIndex = 0;
  let match = pattern.regex.exec(text);

  while (match) {
    const matchedText = match[0] ?? "";
    const startOffset = match.index;
    const endOffset = startOffset + matchedText.length;

    if (matchedText.length > 0) {
      matches.push({
        id: pattern.id,
        label: pattern.label,
        severity: pattern.severity,
        confidence: pattern.confidence,
        startOffset,
        endOffset,
        replacement: pattern.redact(match),
        redactedPreview: pattern.preview(match),
      });
    }

    if (matchedText.length === 0) {
      pattern.regex.lastIndex += 1;
    }

    match = pattern.regex.exec(text);
  }

  return matches;
}

export function collectSecretRedactionMatches(text: string) {
  const orderedPatterns = [...SECRET_PATTERNS];
  const prioritizedMatches = orderedPatterns.flatMap((pattern) =>
    collectPatternMatches(text, pattern).map((match) => ({
      ...match,
      priority: pattern.priority,
    })),
  );

  prioritizedMatches.sort((left, right) => {
    return (
      left.startOffset - right.startOffset ||
      right.priority - left.priority ||
      getSeverityRank(right.severity) - getSeverityRank(left.severity) ||
      (right.endOffset - right.startOffset) - (left.endOffset - left.startOffset) ||
      left.id.localeCompare(right.id)
    );
  });

  const deduped: SecretRedactionMatch[] = [];

  prioritizedMatches.forEach((candidate) => {
    const overlapsExisting = deduped.some((existing) =>
      rangesOverlap(
        candidate.startOffset,
        candidate.endOffset,
        existing.startOffset,
        existing.endOffset,
      ),
    );

    if (!overlapsExisting) {
      deduped.push(candidate);
    }
  });

  return deduped.sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  );
}

export function redactSecretsInText(text: string) {
  const matches = collectSecretRedactionMatches(text);

  if (matches.length === 0) {
    return text;
  }

  let cursor = 0;
  let redacted = "";

  matches.forEach((match) => {
    redacted += text.slice(cursor, match.startOffset);
    redacted += match.replacement;
    cursor = match.endOffset;
  });

  redacted += text.slice(cursor);
  return redacted;
}

function resolveStatementIndexForOffset(
  statements: readonly MigrationStatement[],
  offset: number,
) {
  const containingStatement = statements.find(
    (statement) =>
      statement.startOffset <= offset && statement.endOffset >= offset,
  );

  if (containingStatement) {
    return containingStatement.index;
  }

  if (statements.length === 0) {
    return 0;
  }

  const nearestStatement = statements.reduce<MigrationStatement | null>(
    (closest, statement) => {
      if (!closest) {
        return statement;
      }

      const closestDistance = Math.min(
        Math.abs(closest.startOffset - offset),
        Math.abs(closest.endOffset - offset),
      );
      const candidateDistance = Math.min(
        Math.abs(statement.startOffset - offset),
        Math.abs(statement.endOffset - offset),
      );

      return candidateDistance < closestDistance ? statement : closest;
    },
    null,
  );

  return nearestStatement?.index ?? 0;
}

export function createSecretDetectionFindings({
  sql,
  statements,
}: {
  sql: string;
  statements: readonly MigrationStatement[];
}): Finding[] {
  const matches = collectSecretRedactionMatches(sql);

  if (matches.length === 0) {
    return [];
  }

  const sourceIndex = buildSqlSourceIndex(sql);

  return matches.map((match, index) => {
    const start = locateSourcePosition(sourceIndex, match.startOffset);
    const end = locateSourcePosition(
      sourceIndex,
      Math.max(match.startOffset, match.endOffset - 1),
    );

    return {
      id: `${SECRET_DETECTION_RULE_ID}:${match.id}:${match.startOffset}:${index}`,
      ruleId: SECRET_DETECTION_RULE_ID,
      title: "Possible secret detected in migration input",
      summary: `Detected ${match.label} near \`${match.redactedPreview}\`. The preview is redacted so the original value is not echoed back into the UI.`,
      severity: match.severity,
      category: "security",
      statementIndex: resolveStatementIndexForOffset(statements, match.startOffset),
      lineStart: start.line,
      lineEnd: end.line,
      columnStart: start.column,
      columnEnd: end.column,
      redactedPreview: match.redactedPreview,
      whyItMatters:
        "Accidentally pasting secrets into migration review tooling increases exposure when findings, snippets, screenshots, or exported reports get shared with other people.",
      recommendedAction:
        "Remove the secret if it should not be in the migration, rotate it if it is real, and use redaction mode or Copy redacted SQL before sharing review artifacts.",
      docsLinks: SECRET_DETECTION_DOCS,
      confidence: match.confidence,
      tags: ["security", "secret-detection", match.id],
    };
  });
}
