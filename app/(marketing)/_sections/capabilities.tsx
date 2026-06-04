import {
  UtensilsCrossed,
  Wine,
  BedDouble,
  PartyPopper,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Reveal } from "@/components/marketing/reveal";

const capabilities = [
  {
    icon: UtensilsCrossed,
    title: "Ration & messing",
    description:
      "The monthly mess bill reconciles itself against versioned scales — no manual tallying, no rate disputes at month-end.",
  },
  {
    icon: Wine,
    title: "Bar & cigar",
    description:
      "Per-officer consumption posts straight to the bar bill at verified rates, so the bill is right the first time.",
  },
  {
    icon: BedDouble,
    title: "Guest rooms",
    description:
      "Inventory, bookings and incidentals sit in one view, so occupancy and outstanding charges are clear at handover.",
  },
  {
    icon: PartyPopper,
    title: "Parties",
    description:
      "Plan dining-ins and formal nights, record who attended, and apportion the charges without a separate spreadsheet.",
  },
  {
    icon: ShieldCheck,
    title: "Fine-grained roles",
    description:
      "Every appointment — Bar NCO, Mess Havildar, Quartermaster — sees only its own duty, so handovers are clean and mistakes stay contained.",
  },
  {
    icon: Smartphone,
    title: "One backend, any client",
    description:
      "A versioned REST API exposes the same data and rules to the web app today and a mobile client tomorrow — nothing is re-implemented.",
  },
] as const;

export function Capabilities() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="scroll-mt-20 border-b border-border/60"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Capabilities
          </p>
          <h2
            id="capabilities-heading"
            className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Every mess function, one source of truth.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Each module draws on the same access control, audit trail and unit
            scoping — no parallel spreadsheets, nothing left to reconcile by
            hand.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, description }, i) => (
            <Reveal key={title} delay={(i % 3) * 70}>
              <Card className="lift h-full">
                <CardHeader>
                  <span
                    className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-4">{title}</CardTitle>
                  <CardDescription className="mt-1.5 leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
