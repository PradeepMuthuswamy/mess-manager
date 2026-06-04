import { MailCheck, KeyRound, SquareChartGantt } from "lucide-react";

const steps = [
  {
    icon: MailCheck,
    title: "An admin invites you",
    description:
      "Access is invitation-only. Your unit admin creates the account and assigns your home unit.",
  },
  {
    icon: KeyRound,
    title: "Capabilities scoped to your unit",
    description:
      "You receive a capability template — Bar NCO, Mess Havildar, Quartermaster — bound to that unit only.",
  },
  {
    icon: SquareChartGantt,
    title: "Operate your module",
    description:
      "Sign in and work the screens your duty unlocks. Every change is audit-logged automatically.",
  },
];

export function HowAccessWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-20 border-b border-border/60 bg-muted/30"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
            How access works
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Controlled access, by design.
          </h2>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }, i) => (
            <li key={title} className="bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono tabular text-sm font-semibold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
              </div>
              <h3 className="mt-4 text-base font-medium text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
