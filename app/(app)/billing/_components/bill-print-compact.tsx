import { format } from 'date-fns';
import {
  formatBillCategory,
  formatBillInr,
  type BillPrintModel,
} from './bill-print-classic';

export function BillPrintCompact({ model }: { model: BillPrintModel }) {
  return (
    <div className="space-y-3 text-foreground">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
        <div>
          <h1 className="font-heading text-base font-bold text-foreground">{model.unitName}</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Mess bill · {model.periodName}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs font-semibold text-foreground">{model.billNumber}</p>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">{model.status}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <p>
          <span className="text-muted-foreground">Member </span>
          <span className="font-semibold text-foreground">{model.memberName}</span>
        </p>
        {model.serviceNo && (
          <p>
            <span className="text-muted-foreground">IC </span>
            <span className="font-mono text-foreground">{model.serviceNo}</span>
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Cycle </span>
          <span className="font-mono text-foreground">
            {model.startDate ?? '—'}–{model.endDate ?? '—'}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Due </span>
          <span className="font-mono font-semibold text-foreground">{model.dueDate}</span>
        </p>
      </section>

      <section className="grid grid-cols-4 gap-1 text-[11px] sm:grid-cols-8">
        {model.tiles.map((tile) => (
          <div key={tile.label} className="border-b border-border py-1">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </p>
            <p className="font-mono font-semibold text-foreground">{formatBillInr(tile.amount)}</p>
          </div>
        ))}
      </section>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Cat</th>
            <th className="py-1 pr-2 font-medium">Particulars</th>
            <th className="py-1 pr-2 font-medium">Date</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {model.lineItems.map((item) => (
            <tr key={item.id} className="border-b border-border/70">
              <td className="py-0.5 pr-2 font-mono text-[10px] uppercase text-muted-foreground">
                {formatBillCategory(item.category)}
              </td>
              <td className="py-0.5 pr-2 text-foreground">{item.description}</td>
              <td className="py-0.5 pr-2 font-mono text-[10px] text-muted-foreground">
                {item.itemDate ? format(new Date(item.itemDate), 'dd MMM') : '—'}
              </td>
              <td className="py-0.5 text-right font-mono text-foreground">
                {formatBillInr(item.amount)}
              </td>
            </tr>
          ))}
          {model.lineItems.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-muted-foreground">
                No line items on this statement.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <footer className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-0.5 border-t border-border pt-2 text-xs">
        <p className="text-muted-foreground">
          Total <span className="font-mono font-semibold text-foreground">{formatBillInr(model.totalAmount)}</span>
        </p>
        <p className="text-muted-foreground">
          Paid <span className="font-mono font-semibold text-foreground">{formatBillInr(model.paidAmount)}</span>
        </p>
        <p className="font-heading text-sm font-bold text-foreground">
          Outstanding {formatBillInr(model.outstanding)}
        </p>
      </footer>
    </div>
  );
}
