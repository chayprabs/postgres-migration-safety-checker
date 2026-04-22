import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Container } from "@/components/Container";
import { footerCategories, footerNavigation, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="grid gap-8 py-10 text-sm text-muted-foreground md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">{siteConfig.name}</p>
            <p className="max-w-xl leading-7">{siteConfig.tagline}</p>
          </div>
          <p className="max-w-xl leading-7">{siteConfig.privacyNote}</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <p className="font-medium text-foreground">Navigate</p>
            <nav className="flex flex-col gap-2">
              {footerNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-3">
            <p className="font-medium text-foreground">Categories</p>
            <div className="flex flex-wrap gap-2">
              {footerCategories.map((category) => (
                <Badge key={category} variant="outline">
                  {category}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
