import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export type BillPrintLine = {
  id: string;
  category: string;
  description: string;
  itemDate: string | null;
  amount: number;
};

export type BillPrintTile = {
  label: string;
  amount: number;
};

export type BillPrintModel = {
  unitName: string;
  billNumber: string;
  periodName: string;
  startDate?: string;
  endDate?: string;
  dueDate: string;
  memberName: string;
  serviceNo: string | null;
  status: string;
  tiles: BillPrintTile[];
  lineItems: BillPrintLine[];
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
};

export function formatBillInr(value: number) {
  return `₹${value.toFixed(2)}`;
}

export function formatBillCategory(category: string) {
  const labels: Record<string, string> = {
    messing: 'Messing',
    bar: 'Bar',
    room: 'Rooms',
    guest_meal: 'Guests',
    subscription: 'Funds',
    misc: 'Misc',
    party: 'Party',
    arrear: 'Arrears',
  };
  return labels[category] ?? category.replaceAll('_', ' ');
}

export function BillPrintClassic({ model }: { model: BillPrintModel }) {
  return (
    <div className="space-y-6 text-foreground">
      <header className="space-y-1 border-b border-border pb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Officers Mess · Monthly statement
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {model.unitName}
        </h1>
        <p className="font-heading text-lg font-semibold text-foreground">{model.periodName}</p>
        <p className="font-mono text-sm text-foreground">{model.billNumber}</p>
      </header>

      <section className="grid gap-4 border border-border p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Officer / Member</p>
          <p className="font-heading text-base font-semibold text-foreground">{model.memberName}</p>
          {model.serviceNo && (
            <p className="font-mono text-xs text-muted-foreground">IC No: {model.serviceNo}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Billing cycle</p>
          <p className="font-mono text-sm text-foreground">
            {model.startDate ?? '—'} to {model.endDate ?? '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            Due on <span className="font-semibold text-foreground">{model.dueDate}</span>
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {model.tiles.map((tile) => (
          <div key={tile.label} className="border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </p>
            <p className="font-mono font-bold text-foreground">{formatBillInr(tile.amount)}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Itemized ledger
        </h2>
        <div className="divide-y divide-border border border-border">
          {model.lineItems.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 p-2.5 text-sm">
              <div>
                <p className="text-foreground">
                  <span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">
                    {formatBillCategory(item.category)}
                  </span>
                  {item.description}
                </p>
                {item.itemDate && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {format(new Date(item.itemDate), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
              <p className="font-mono font-semibold text-foreground">{formatBillInr(item.amount)}</p>
            </div>
          ))}
          {model.lineItems.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No line items on this statement.</p>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4 border border-border p-4">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Bill total{' '}
            <span className="font-mono font-semibold text-foreground">
              {formatBillInr(model.totalAmount)}
            </span>
          </p>
          <p className="text-muted-foreground">
            Paid{' '}
            <span className="font-mono font-semibold text-foreground">
              {formatBillInr(model.paidAmount)}
            </span>
          </p>
          <p className="font-heading text-lg font-bold text-foreground">
            Outstanding <span className="font-mono">{formatBillInr(model.outstanding)}</span>
          </p>
        </div>
        <Badge
          variant={model.status === 'paid' ? 'success' : 'outline'}
          className="font-mono text-xs capitalize"
        >
          {model.status}
        </Badge>
      </section>
    </div>
  );
}
