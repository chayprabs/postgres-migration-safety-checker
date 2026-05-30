import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
      </div>
    </footer>
  );
}
