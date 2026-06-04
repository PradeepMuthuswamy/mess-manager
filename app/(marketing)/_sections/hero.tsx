import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";
import type { AuthUser } from "@/lib/auth/types";

import { StatusPanel } from "./status-panel";

export function Hero({ user }: { user: AuthUser | null }) {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <Badge variant="secondary" className="font-mono">
            Purpose-built for the Officers Mess
          </Badge>
          <h1 className="mt-6 text-balance text-4xl leading-[1.05] font-semibold text-foreground sm:text-5xl md:text-6xl">
            One system for the entire mess.
          </h1>
          <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Ration, bar, guest rooms, parties and billing — every figure traced
            to a versioned rate, every change on the audit log, and every
            appointment scoped to its own duty.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="press transition-ds h-11 px-5">
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
                className="press transition-ds h-11 px-5"
              >
                <a href="mailto:admin@yourmess.example">
                  Contact admin for an invitation
                </a>
              </Button>
            )}
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-5" aria-hidden />
            Invitation-only · unit-scoped access
          </p>
        </div>

        <Reveal delay={80}>
          <StatusPanel />
        </Reveal>
      </div>
    </section>
  );
}
