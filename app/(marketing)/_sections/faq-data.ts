// Single source of truth for the FAQ section AND the FAQPage JSON-LD.
// Keep answers factual and consistent with visible page content — AI answer
// engines (GEO) extract these verbatim.

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Officers Mess self-service or invitation-only?",
    answer:
      "It is invitation-only. There is no public sign-up. A unit admin creates each account and assigns the member's home unit before they can sign in.",
  },
  {
    question: "Does it support multiple units?",
    answer:
      "Yes. It is multi-tenant by design. Each unit's data is isolated at the database level with Postgres row-level security, so members only ever see their own unit. Admins can operate across units.",
  },
  {
    question: "Is there an API or a mobile app?",
    answer:
      "There is a stable, versioned REST API at /api/v1 with bearer authentication and idempotency keys. The web app and any future mobile client share the same backend, rules, and data.",
  },
  {
    question: "How is access controlled?",
    answer:
      "Access is capability-scoped. Each appointment receives a capability template — for example Bar NCO, Mess Havildar, or Quartermaster — bound to a single unit. Members only see and act on the modules their duty requires.",
  },
  {
    question: "Where is the data stored and is it audited?",
    answer:
      "Data is stored in a managed Postgres database (Supabase). Every change to master lists, profiles, units, and capabilities is written to an immutable audit log, so every figure on a bill is traceable.",
  },
  {
    question: "How are rates and bills kept accurate over time?",
    answer:
      "Master items and rates are version-tracked (SCD-2). A bill always reflects the rate that applied at the time, so historical bills never change when a current rate is updated.",
  },
];
