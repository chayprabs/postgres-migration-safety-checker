import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
export const metadata: Metadata = buildPageMetadata({ title: "Privacy Policy", description: siteConfig.privacyNote, path: "/privacy" });
const points = ["SQL is analyzed in your browser.", "Files are read locally only.", "Settings links never include SQL.", "Reports are generated locally.", "Optional history requires confirmation.", "Analytics exclude raw SQL if enabled."];
export default function PrivacyPage() {
  return (<article className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><h1 className="text-2xl font-semibold">Privacy Policy</h1><p className="mt-2 text-sm text-muted-foreground">Last updated: May 30, 2026</p><ul className="mt-8 list-disc space-y-3 pl-5 text-muted-foreground">{points.map((p)=><li key={p}>{p}</li>)}</ul><p className="mt-8"><Link href="/terms" className="underline">Terms</Link> · <Link href="/" className="underline">Checker</Link></p></article>);
}
