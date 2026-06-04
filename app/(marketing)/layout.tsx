import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/get-current-user";

const navAnchors = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#governance", label: "Governance" },
  { href: "#faq", label: "FAQ" },
];

const footerColumns = [
  {
    heading: "Product",
    links: [
      { href: "#capabilities", label: "Capabilities" },
      { href: "#how-it-works", label: "How access works" },
      { href: "#governance", label: "Governance" },
      { href: "#roles", label: "Built for roles" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Modules",
    links: [
      { href: "#capabilities", label: "Ration & messing" },
      { href: "#capabilities", label: "Bar & cigar" },
      { href: "#capabilities", label: "Guest rooms" },
      { href: "#capabilities", label: "Parties" },
    ],
  },
  {
    heading: "Access",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "mailto:admin@yourmess.example", label: "Request an invitation" },
    ],
  },
];

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground transition-ds hover:text-primary"
          >
            <span
              className="inline-block size-5 rounded-sm bg-primary"
              aria-hidden
            />
            Officers Mess
          </Link>

          <nav
            className="hidden items-center gap-6 md:flex"
            aria-label="Sections"
          >
            {navAnchors.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="rounded-sm text-sm text-muted-foreground transition-ds hover:text-foreground"
              >
                {a.label}
              </a>
            ))}
          </nav>

          <Button
            asChild
            variant="default"
            size="sm"
            className="press transition-ds"
          >
            <Link href={user ? "/dashboard" : "/sign-in"}>
              {user ? "Dashboard" : "Sign in"}
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 scroll-smooth">{children}</main>

      <footer className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground transition-ds hover:text-primary"
              >
                <span
                  className="inline-block size-5 rounded-sm bg-primary"
                  aria-hidden
                />
                Officers Mess
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                A multi-unit Officers Mess platform — ration, bar, rooms,
                parties and billing under governed access.
              </p>
            </div>

            {footerColumns.map((col) => (
              <div key={col.heading}>
                <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  {col.heading}
                </h2>
                <ul className="mt-4 space-y-2">
                  {col.links.map((link) => (
                    <li key={`${col.heading}-${link.label}`}>
                      {link.href.startsWith("/") ? (
                        <Link
                          href={link.href}
                          className="rounded-sm text-sm text-muted-foreground transition-ds hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="rounded-sm text-sm text-muted-foreground transition-ds hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
            <span className="text-sm text-muted-foreground">
              © 2026 Officers Mess. All rights reserved.
            </span>
            <span className="font-mono text-xs tracking-wide text-muted-foreground/60 uppercase">
              Secure · Multi-unit · Versioned API
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
