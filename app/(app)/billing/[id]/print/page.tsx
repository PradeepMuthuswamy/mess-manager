import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getMessBillDetails } from '@/lib/billing/queries';
import { Badge } from '@/components/ui/badge';
import { PrintButton } from './print-button';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

function inr(value: number) {
  return `₹${value.toFixed(2)}`;
}

function memberLabel(details: NonNullable<Awaited<ReturnType<typeof getMessBillDetails>>>) {
  const rank = details.profile?.rank?.trim();
  const name = details.profile?.full_name?.trim();
  return [rank, name].filter(Boolean).join(' ') || 'Officer';
}

export default async function BillPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const details = await getMessBillDetails(id);

  if (!details) notFound();

  const isOwner = details.profile_id === user.id;
  const canDraft = userHasCapability(user, 'billing.draft', details.unit_id);
  if (!isOwner && !canDraft) {
    redirect('/billing');
  }

  const outstanding = Number(details.total_amount) - Number(details.paid_amount ?? 0);
  const tiles: { label: string; amount: number }[] = [
    { label: 'Messing', amount: Number(details.messing_amount) },
    { label: 'Bar', amount: Number(details.bar_amount) },
    { label: 'Rooms', amount: Number(details.room_amount) },
    { label: 'Guests', amount: Number(details.guest_meal_amount) },
    { label: 'Funds', amount: Number(details.subscriptions_amount) },
    { label: 'Misc', amount: Number(details.misc_amount) },
    { label: 'Party', amount: Number(details.party_amount ?? 0) },
    { label: 'Arrears', amount: Number(details.arrears_amount ?? 0) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-background p-6 text-foreground print:max-w-none print:p-0">
      <PrintButton />

      <header className="space-y-1 border-b border-border pb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Officers Mess · Monthly statement
        </p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          {details.period?.name ?? 'Monthly Mess Bill'}
        </h1>
        <p className="font-mono text-sm text-foreground">{details.bill_number}</p>
      </header>

      <section className="grid gap-4 border border-border p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Officer / Member</p>
          <p className="font-heading text-base font-semibold text-foreground">{memberLabel(details)}</p>
          {details.profile?.service_no && (
            <p className="font-mono text-xs text-muted-foreground">IC No: {details.profile.service_no}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Billing cycle</p>
          <p className="font-mono text-sm text-foreground">
            {details.period?.start_date} to {details.period?.end_date}
          </p>
          <p className="text-xs text-muted-foreground">
            Due on <span className="font-semibold text-foreground">{details.due_date}</span>
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="border border-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </p>
            <p className="font-mono font-bold text-foreground">{inr(tile.amount)}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Itemized ledger
        </h2>
        <div className="divide-y divide-border border border-border">
          {(details.line_items ?? []).map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 p-2.5 text-sm">
              <div>
                <p className="text-foreground">
                  <span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">
                    {item.category}
                  </span>
                  {item.description}
                </p>
                {item.item_date && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {format(new Date(item.item_date), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
              <p className="font-mono font-semibold text-foreground">{inr(Number(item.amount))}</p>
            </div>
          ))}
          {(details.line_items ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No line items on this statement.</p>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4 border border-border p-4">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Bill total{' '}
            <span className="font-mono font-semibold text-foreground">{inr(Number(details.total_amount))}</span>
          </p>
          <p className="text-muted-foreground">
            Paid{' '}
            <span className="font-mono font-semibold text-foreground">
              {inr(Number(details.paid_amount ?? 0))}
            </span>
          </p>
          <p className="font-heading text-lg font-bold text-foreground">
            Outstanding{' '}
            <span className="font-mono">{inr(outstanding)}</span>
          </p>
        </div>
        <Badge
          variant={details.status === 'paid' ? 'success' : 'outline'}
          className="font-mono text-xs capitalize"
        >
          {details.status}
        </Badge>
      </section>
    </div>
  );
}
