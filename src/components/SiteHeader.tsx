"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonStyles } from "@/components/Button";
import { Container } from "@/components/Container";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { headerNavigation, siteConfig } from "@/lib/site";

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <Container className="py-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-md text-lg font-semibold tracking-tight text-foreground transition hover:text-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => setIsMenuOpen(false)}
          >
            {siteConfig.name}
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <nav aria-label="Primary" className="flex items-center gap-1">
              {headerNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-site-nav"
              aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className={buttonStyles({ variant: "secondary", size: "icon" })}
              onClick={() => setIsMenuOpen((value) => !value)}
            >
              {isMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        <div
          id="mobile-site-nav"
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-200 md:hidden",
            isMenuOpen ? "max-h-96 pt-4 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="rounded-3xl border border-border bg-card p-3 shadow-sm">
            <nav aria-label="Mobile primary" className="grid gap-1">
              {headerNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </Container>
    </header>
  );
}
