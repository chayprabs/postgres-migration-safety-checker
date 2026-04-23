import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://authos.dev";

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

type BuildPageMetadataInput = {
  description: string;
  keywords?: string[];
  path: string;
  title: string;
  type?: "article" | "website";
};

export function buildPageMetadata({
  description,
  keywords,
  path,
  title,
  type = "website",
}: BuildPageMetadataInput): Metadata {
  const canonical = getCanonicalUrl(path);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type,
      siteName: "Authos",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
