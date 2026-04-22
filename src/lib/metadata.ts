const DEFAULT_SITE_URL = "http://localhost:3000";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getSiteUrl() {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}

export function getMetadataBase() {
  return new URL(getSiteUrl());
}

export function getCanonicalUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}
