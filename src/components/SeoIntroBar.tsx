import { siteConfig } from "@/lib/site";

export function SeoIntroBar() {
  return (
    <section aria-label="Product summary" className="border-b border-border bg-muted/30">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-3 sm:px-6">
        <h1 className="text-sm font-medium text-foreground sm:text-[0.9375rem]">
          {siteConfig.fullName}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {siteConfig.description}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {siteConfig.tagline} No login required. Your SQL stays in this browser.
        </p>
      </div>
    </section>
  );
}
