import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms & Conditions",
  description: "Terms for using the PostgreSQL Migration Safety Checker.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 30, 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">1. Acceptance</h2>
          <p>By using the PostgreSQL Migration Safety Checker, you agree to these Terms.</p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">2. No professional advice</h2>
          <p>Output is informational only, not legal, security, or database administration advice.</p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">3. Disclaimer of warranties</h2>
          <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.</p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-foreground">4. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOSS OF PROFITS OR DATA. TOTAL LIABILITY
            SHALL NOT EXCEED US$100.
          </p>
        </section>
      </div>
      <p className="mt-10 text-sm">
        <Link href="/privacy" className="text-foreground underline">Privacy Policy</Link>
        {" · "}
        <Link href="/" className="text-foreground underline">Back to checker</Link>
      </p>
    </article>
  );
}
