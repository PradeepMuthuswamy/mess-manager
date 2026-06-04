import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/lib/auth/types";

export function CtaBand({ user }: { user: AuthUser | null }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20 lg:flex-row lg:items-center lg:justify-between lg:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold text-primary-foreground sm:text-4xl">
            Bring the entire mess onto one system.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
            Invitation-only, unit-scoped, and audit-logged from the first
            sign-in.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="press transition-ds h-11 px-5"
          >
            <Link href={user ? "/dashboard" : "/sign-in"}>
              {user ? "Go to dashboard" : "Sign in"}
              <ArrowRight className="size-5" aria-hidden />
            </Link>
          </Button>
          {user ? null : (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="press transition-ds h-11 border-primary-foreground/30 bg-transparent px-5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <a href="mailto:admin@yourmess.example">
                Contact admin for an invitation
              </a>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
