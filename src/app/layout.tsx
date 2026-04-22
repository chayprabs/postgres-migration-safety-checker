import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getMetadataBase } from "@/lib/metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: "Authos",
    template: "%s | Authos",
  },
  description:
    "Browser-first developer tools for safer shipping, starting with a privacy-first PostgreSQL Migration Safety Checker.",
  applicationName: "Authos",
  keywords: [
    "Authos",
    "developer tools",
    "PostgreSQL migration safety",
    "database migrations",
    "browser local analysis",
  ],
  openGraph: {
    title: "Authos",
    description:
      "Browser-first developer tools for safer shipping, starting with a privacy-first PostgreSQL Migration Safety Checker.",
    siteName: "Authos",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Authos",
    description:
      "Browser-first developer tools for safer shipping, starting with a privacy-first PostgreSQL Migration Safety Checker.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
