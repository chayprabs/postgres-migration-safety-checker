import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
export const metadata: Metadata = buildPageMetadata({ title: "Terms & Conditions", description: "Terms for using the checker.", path: "/terms" });
export default function TermsPage() {
  return (<article className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><h1 className="text-2xl font-semibold">Terms &amp; Conditions</h1><p className="mt-2 text-sm text-muted-foreground">Last updated: May 30, 2026</p>
  <div className="mt-8 space-y-6 text-sm text-muted-foreground"><p>THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOSS OF PROFITS OR DATA, ARISING FROM USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED US$100.</p>
  <p>Output is informational only, not legal or DBA advice. You are solely responsible for database changes.</p></div>
  <p className="mt-8"><Link href="/privacy" className="underline">Privacy</Link> · <Link href="/" className="underline">Checker</Link></p></article>);
}
