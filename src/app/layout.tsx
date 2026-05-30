import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getMetadataBase } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
import "./globals.css";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: { default: siteConfig.fullName, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.fullName,
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen flex-col"><SiteHeader /><main className="flex-1">{children}</main><SiteFooter /></div>
      </body>
    </html>
  );
}
