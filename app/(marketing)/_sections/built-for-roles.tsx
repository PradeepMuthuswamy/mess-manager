import {
  ClipboardList,
  Beer,
  Boxes,
  BedDouble,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Reveal } from "@/components/marketing/reveal";

// Roles map to the seeded capability_templates in the system.
const roles = [
  {
    icon: ShieldCheck,
    role: "Mess Secretary / PMC",
    can: "Run the whole mess: invite members, manage units and master rates, finalise bills, and read every report for the unit.",
  },
  {
    icon: ClipboardList,
    role: "Mess Havildar",
    can: "Handle day-to-day operations in the unit — record attendance, issue rations, and keep messing accounts moving.",
  },
  {
    icon: Beer,
    role: "Bar NCO",
    can: "Log alcohol and cigar consumption per officer and finalise the bar bill — and nothing outside the bar.",
  },
  {
    icon: Boxes,
    role: "Quartermaster",
    can: "Maintain ration scales and master items, then issue and adjust rations against the versioned rates.",
  },
  {
    icon: BedDouble,
    role: "Guest Room Clerk",
    can: "Make and edit room bookings, record incidentals, and keep occupancy current for handover.",
  },
  {
    icon: PartyPopper,
    role: "Party Coordinator",
    can: "Plan dining-ins, farewells and formal nights, record attendance, and apportion the charges.",
  },
] as const;

export function BuiltForRoles() {
  return (
    <section
      id="roles"
      aria-labelledby="roles-heading"
      className="scroll-mt-20 border-b border-border/60 bg-muted/30"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Roles
          </p>
          <h2
            id="roles-heading"
            className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Built around your appointments.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Each member holds a capability template bound to their unit — they
            see and act on exactly what their appointment requires, and nothing
            beyond it.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map(({ icon: Icon, role, can }, i) => (
            <Reveal key={role} delay={(i % 3) * 70}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="mt-4 text-[0.95rem]">{role}</CardTitle>
                  <CardDescription className="mt-1.5 leading-relaxed">
                    {can}
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
