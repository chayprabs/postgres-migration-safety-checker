export type NavigationItem = {
  href: string;
  label: string;
};

export const siteConfig = {
  name: "Authos",
  description:
    "Browser-first developer tools for careful shipping, starting with PostgreSQL migration safety.",
  tagline: "Browser-based tools for developers who need answers fast.",
  privacyNote: "Most tools are designed to run locally in your browser.",
};

export const headerNavigation: NavigationItem[] = [
  { href: "/tools", label: "Tools" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" },
];

export const footerNavigation = headerNavigation;

export const footerCategories = [
  "API",
  "SQL",
  "Kubernetes",
  "Security",
  "Data",
] as const;
