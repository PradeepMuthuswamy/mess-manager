import {
  ShieldCheck,
  ScrollText,
  KeyRound,
  Webhook,
  Building2,
} from "lucide-react";

const chips = [
  { icon: ShieldCheck, label: "Row-level security" },
  { icon: ScrollText, label: "Audit trail on every change" },
  { icon: KeyRound, label: "Capability-scoped RBAC" },
  { icon: Building2, label: "Multi-unit isolation" },
  { icon: Webhook, label: "Versioned REST API" },
];

export function TrustStrip() {
  return (
    <section
      aria-labelledby="foundation-heading"
      className="border-b border-border/60 bg-muted/30"
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-sm">
            <h2
              id="foundation-heading"
              className="text-sm font-medium text-foreground"
            >
              Accountable by construction
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Isolation, audit and access control are enforced in the database
              — not the interface.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <Icon className="size-5 text-muted-foreground" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
