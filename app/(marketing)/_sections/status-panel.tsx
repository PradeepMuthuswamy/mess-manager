import { LayoutGrid } from "lucide-react";

type ModuleState = "live" | "available";

const modules: {
  label: string;
  value: string;
  state: ModuleState;
}[] = [
  {
    label: "Ration & messing",
    value: "Versioned scales and self-reconciling monthly bills",
    state: "available",
  },
  {
    label: "Bar & cigar",
    value: "Per-officer consumption posted against verified rates",
    state: "available",
  },
  {
    label: "Guest rooms",
    value: "Room inventory, bookings and incidentals in one view",
    state: "live",
  },
  {
    label: "Parties",
    value: "Plan dining-ins and apportion charges to attendees",
    state: "available",
  },
  {
    label: "Billing",
    value: "Draft, finalise and publish bills with a full audit trail",
    state: "available",
  },
  {
    label: "Reports",
    value: "Unit and cross-unit reporting on the same source data",
    state: "available",
  },
];

export function StatusPanel() {
  return (
    <div className="elevate-hairline rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground"
            aria-hidden
          >
            <LayoutGrid className="size-5" />
          </span>
          <span className="font-heading text-sm font-medium text-foreground">
            What you get
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Every mess function
        </span>
      </div>

      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {modules.map((m) => (
          <li key={m.label} className="flex items-start gap-3 bg-card p-4">
            <span
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                m.state === "live" ? "bg-success" : "bg-muted-foreground"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {m.label}
                </span>
                <span
                  className={
                    m.state === "live"
                      ? "shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                      : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  }
                >
                  {m.state === "live" ? "Live" : "Available"}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {m.value}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted-foreground">
        One foundation beneath every module — access control, audit, unit
        scoping.
      </p>
    </div>
  );
}
