import { History, ScrollText, ShieldCheck, Webhook } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const pillars = [
  {
    icon: History,
    title: "Versioned masters",
    description:
      "Rates and master items are SCD-2 versioned — historical bills always reflect the rate that applied then.",
  },
  {
    icon: ScrollText,
    title: "Audit trail",
    description:
      "Every change to masters, profiles, units and capabilities is written to an immutable audit log.",
  },
  {
    icon: ShieldCheck,
    title: "Row-level security",
    description:
      "Postgres RLS enforces unit isolation at the database, not just the UI — defence in depth.",
  },
  {
    icon: Webhook,
    title: "Versioned REST API",
    description:
      "A stable /api/v1 surface with bearer auth and idempotency keys means a mobile client can be added without rebuilding the backend.",
  },
];

export function Governance() {
  return (
    <section
      id="governance"
      aria-labelledby="governance-heading"
      className="scroll-mt-20 border-b border-border/60"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Governance
          </p>
          <h2
            id="governance-heading"
            className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Trust you can audit.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Four guarantees that hold whether a bill is raised today or reviewed
            years from now.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <span
                  className="inline-flex size-9 items-center justify-center rounded-lg bg-success/10 text-success"
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <CardTitle className="mt-4 text-[0.95rem]">{title}</CardTitle>
                <CardDescription className="mt-1.5 leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
