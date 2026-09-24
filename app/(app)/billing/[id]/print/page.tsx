import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getMessBillDetails } from '@/lib/billing/queries';
import { resolveBillFormatTemplate } from '@/lib/billing/templates';
import { getCollection } from '@/lib/mongo';
import type { MessBillWithDetails } from '@/lib/billing/types';
import { BillPrintClassic, type BillPrintModel } from '../../_components/bill-print-classic';
import { BillPrintCompact } from '../../_components/bill-print-compact';
import { BillPrintFormal } from '../../_components/bill-print-formal';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

function memberLabel(details: MessBillWithDetails) {
  const rank = details.profile?.rank?.trim();
  const name = details.profile?.full_name?.trim();
  return [rank, name].filter(Boolean).join(' ') || 'Officer';
}

function toPrintModel(details: MessBillWithDetails, unitName: string): BillPrintModel {
  return {
    unitName,
    billNumber: details.bill_number,
    periodName: details.period?.name ?? 'Monthly Mess Bill',
    startDate: details.period?.start_date,
    endDate: details.period?.end_date,
    dueDate: details.due_date,
    memberName: memberLabel(details),
    serviceNo: details.profile?.service_no ?? null,
    status: details.status,
    tiles: [
      { label: 'Messing', amount: Number(details.messing_amount) },
      { label: 'Bar', amount: Number(details.bar_amount) },
      { label: 'Rooms', amount: Number(details.room_amount) },
      { label: 'Guests', amount: Number(details.guest_meal_amount) },
      { label: 'Funds', amount: Number(details.subscriptions_amount) },
      { label: 'Misc', amount: Number(details.misc_amount) },
      { label: 'Party', amount: Number(details.party_amount ?? 0) },
      { label: 'Arrears', amount: Number(details.arrears_amount ?? 0) },
    ],
    lineItems: (details.line_items ?? []).map((item) => ({
      id: item.id,
      category: item.category,
      description: item.description,
      itemDate: item.item_date,
      amount: Number(item.amount),
    })),
    totalAmount: Number(details.total_amount),
    paidAmount: Number(details.paid_amount ?? 0),
    outstanding: Number(details.total_amount) - Number(details.paid_amount ?? 0),
  };
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
  const canFinalize = userHasCapability(user, 'billing.finalize', details.unit_id);
  if (!isOwner && !canDraft && !canFinalize) {
    redirect('/billing');
  }

  const col = await getCollection('units');
  const unit = await col.findOne({ id: details.unit_id });

  const unitMeta = unit as { name?: string; bill_format_template?: string | null } | null;
  const unitName = unitMeta?.name?.trim() || 'Officers Mess';
  const template = resolveBillFormatTemplate(unitMeta?.bill_format_template);
  const model = toPrintModel(details, unitName);

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-background p-6 text-foreground print:max-w-none print:p-0">
      <div className="print:hidden">
        <PrintButton />
      </div>

      {template === 'compact' ? (
        <BillPrintCompact model={model} />
      ) : template === 'formal' ? (
        <BillPrintFormal model={model} />
      ) : (
        <BillPrintClassic model={model} />
      )}
    </div>
  );
}
