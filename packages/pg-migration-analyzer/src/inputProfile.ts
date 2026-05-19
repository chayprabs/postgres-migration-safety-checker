const KILOBYTE = 1024;
const MEGABYTE = 1024 * KILOBYTE;

export const SQL_INPUT_NORMAL_LIMIT_BYTES = 250 * KILOBYTE;
export const SQL_INPUT_WARNING_LIMIT_BYTES = 1 * MEGABYTE;
export const SQL_INPUT_CONFIRMATION_LIMIT_BYTES = 3 * MEGABYTE;
export const LARGE_INPUT_WARNING_MESSAGE =
  "This migration is large. Browser analysis may be slower, and some syntax details may use fallback detection.";

export type SqlInputSizeBucket =
  | "normal"
  | "warning"
  | "confirmation-required"
  | "blocked";

export type SqlInputProfile = {
  bucket: SqlInputSizeBucket;
  byteLength: number;
  fingerprint: string;
};

export type SqlInputExecutionSupport = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  workerSupported: boolean;
};

export function formatSqlInputSize(byteLength: number) {
  if (byteLength >= MEGABYTE) {
    return `${(byteLength / MEGABYTE).toFixed(byteLength >= 10 * MEGABYTE ? 0 : 1)} MB`;
  }

  if (byteLength >= KILOBYTE) {
    return `${Math.round(byteLength / KILOBYTE)} KB`;
  }

  return `${byteLength} B`;
}

export function getUtf8ByteLength(value: string) {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) {
      byteLength += 1;
      continue;
    }

    if (codeUnit <= 0x7ff) {
      byteLength += 2;
      continue;
    }

    if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length
    ) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
        continue;
      }
    }

    byteLength += 3;
  }

  return byteLength;
}

function getFingerprintHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getSqlInputProfile(sql: string): SqlInputProfile {
  const trimmedSql = sql.trim();
  const byteLength = getUtf8ByteLength(trimmedSql);

  let bucket: SqlInputSizeBucket = "normal";

  if (byteLength > SQL_INPUT_CONFIRMATION_LIMIT_BYTES) {
    bucket = "blocked";
  } else if (byteLength > SQL_INPUT_WARNING_LIMIT_BYTES) {
    bucket = "confirmation-required";
  } else if (byteLength > SQL_INPUT_NORMAL_LIMIT_BYTES) {
    bucket = "warning";
  }

  return {
    bucket,
    byteLength,
    fingerprint: `${byteLength}:${trimmedSql.length}:${getFingerprintHash(trimmedSql)}`,
  };
}

export function canSafelyOverrideBlockedInput(
  profile: SqlInputProfile,
  support: SqlInputExecutionSupport,
) {
  if (profile.bucket !== "blocked") {
    return true;
  }

  if (!support.workerSupported) {
    return false;
  }

  const hasEnoughCpu =
    support.hardwareConcurrency === undefined || support.hardwareConcurrency >= 4;
  const hasEnoughMemory =
    support.deviceMemory === undefined || support.deviceMemory >= 4;

  return hasEnoughCpu && hasEnoughMemory;
}
