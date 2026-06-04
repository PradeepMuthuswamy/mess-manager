import { FAQ_ITEMS } from "./faq-data";

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-20 border-b border-border/60"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="max-w-md">
            <p className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
              FAQ
            </p>
            <h2
              id="faq-heading"
              className="mt-3 text-balance text-3xl font-semibold text-foreground sm:text-4xl"
            >
              Questions, answered plainly.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              How access, units, data and the API actually work.
            </p>
          </div>

          <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question} className="bg-card p-6">
                <dt className="text-base font-medium text-foreground">
                  {item.question}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
