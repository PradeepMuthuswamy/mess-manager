import { format } from 'date-fns';
import {
  formatBillCategory,
  formatBillInr,
  type BillPrintModel,
} from './bill-print-classic';

export function BillPrintFormal({ model }: { model: BillPrintModel }) {
  return (
    <div className="space-y-8 text-foreground">
      <header className="space-y-2 border-b-2 border-foreground pb-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          Officers&apos; Mess
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {model.unitName}
        </h1>
        <p className="font-heading text-sm font-semibold uppercase tracking-widest text-foreground">
          Monthly Mess Account
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {model.periodName} · {model.billNumber}
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            To
          </p>
          <p className="font-heading text-lg font-semibold text-foreground">{model.memberName}</p>
          {model.serviceNo && (
            <p className="font-mono text-xs text-muted-foreground">IC No. {model.serviceNo}</p>
          )}
        </div>
        <div className="space-y-1 sm:text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Accounting period
          </p>
          <p className="font-mono text-sm text-foreground">
            {model.startDate ?? '—'} to {model.endDate ?? '—'}
          </p>
          <p className="text-sm text-muted-foreground">
            Payable on or before{' '}
            <span className="font-semibold text-foreground">{model.dueDate}</span>
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Status · {model.status}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-foreground">
          Abstract of charges
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-foreground text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 font-medium">Head</th>
              <th className="py-2 text-right font-medium">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {model.tiles.map((tile) => (
              <tr key={tile.label} className="border-b border-border">
                <td className="py-1.5 text-foreground">{tile.label}</td>
                <td className="py-1.5 text-right font-mono text-foreground">
                  {formatBillInr(tile.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-foreground">
          Itemized ledger
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-foreground text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Head</th>
              <th className="py-2 pr-3 font-medium">Particulars</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 text-right font-medium">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {model.lineItems.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-1.5 pr-3 font-mono text-[10px] uppercase text-muted-foreground">
                  {formatBillCategory(item.category)}
                </td>
                <td className="py-1.5 pr-3 text-foreground">{item.description}</td>
                <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">
                  {item.itemDate ? format(new Date(item.itemDate), 'dd MMM yyyy') : '—'}
                </td>
                <td className="py-1.5 text-right font-mono text-foreground">
                  {formatBillInr(item.amount)}
                </td>
              </tr>
            ))}
            {model.lineItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  No line items on this statement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-y-2 border-foreground py-4">
        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Bill total</span>
            <span className="font-mono font-semibold text-foreground">
              {formatBillInr(model.totalAmount)}
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Amount received</span>
            <span className="font-mono font-semibold text-foreground">
              {formatBillInr(model.paidAmount)}
            </span>
          </div>
          <div className="flex justify-between font-heading text-base font-bold text-foreground">
            <span>Outstanding</span>
            <span className="font-mono">{formatBillInr(model.outstanding)}</span>
          </div>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Certified that the charges above, including party recoveries and arrears brought forward,
        have been compiled from the mess registers for the period stated and are correct to the
        best of our knowledge.
      </p>

      <footer className="grid break-inside-avoid grid-cols-1 gap-12 pt-8 sm:grid-cols-2">
        <div className="space-y-10">
          <div className="h-12 border-b border-foreground" />
          <div>
            <p className="font-heading text-sm font-semibold text-foreground">
              President, Mess Committee
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              PMC
            </p>
          </div>
        </div>
        <div className="space-y-10">
          <div className="h-12 border-b border-foreground" />
          <div>
            <p className="font-heading text-sm font-semibold text-foreground">Mess Secretary</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              For the Mess Committee
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
