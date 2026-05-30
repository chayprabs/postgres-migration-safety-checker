import Link from "next/link";
import { Globe } from "lucide-react";
import { siteConfig } from "@/lib/site";
function GitHubIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>);
}
function XIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>);
}
const linkClass = "inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">{siteConfig.name}</Link>
        <nav aria-label="External links" className="flex items-center gap-1">
          <a href={siteConfig.githubUrl} target="_blank" rel="noopener noreferrer" className={linkClass} aria-label="GitHub"><GitHubIcon className="size-5" /></a>
          <a href={siteConfig.twitterUrl} target="_blank" rel="noopener noreferrer" className={linkClass} aria-label="X"><XIcon className="size-5" /></a>
          <a href={siteConfig.websiteUrl} target="_blank" rel="noopener noreferrer" className={linkClass} aria-label="Website"><Globe className="size-5" aria-hidden /></a>
        </nav>
      </div>
    </header>
  );
}
