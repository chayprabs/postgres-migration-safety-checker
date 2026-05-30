import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy",
  description: siteConfig.privacyNote,
  path: "/privacy",
});

const points = [
  "Migration SQL is analyzed in your browser using a Web Worker when available.",
  "Uploaded .sql files are read by the browser only — not sent to our servers for analysis.",
  "Shareable settings links include review preferences only, never pasted SQL.",
  "Reports (Markdown, HTML, JSON) are generated locally in your browser.",
  "Optional local history requires your explicit confirmation before storing SQL.",
  "If analytics are enabled, payloads exclude raw SQL, filenames, and object names.",
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 30, 2026</p>
      <p className="mt-6 leading-7 text-muted-foreground">{siteConfig.privacyNote}</p>
      <ul className="mt-8 list-disc space-y-3 pl-5 text-muted-foreground">
        {points.map((point) => (
          <li key={point} className="leading-7">{point}</li>
        ))}
      </ul>
      <section className="mt-10 space-y-3 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Disclaimer</h2>
        <p>
          This tool is provided for informational purposes only. We do not warrant accuracy of
          analysis results. You are solely responsible for reviewing and deploying database changes.
          See our{" "}
          <Link href="/terms" className="text-foreground underline">Terms &amp; Conditions</Link>{" "}
          for limitation of liability.
        </p>
      </section>
      <p className="mt-10 text-sm">
        <Link href="/terms" className="text-foreground underline">Terms</Link>
        {" · "}
        <Link href="/" className="text-foreground underline">Back to checker</Link>
      </p>
    </article>
  );
}
