import 'server-only';

import { getCollection } from '@/lib/mongo';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import {
  sendMessBillEmail,
  sendMessBillPublishSummaryEmail,
} from '@/lib/email/resend';
import { getPublishedBillsForEmail, getSentMessBillEmailIds } from './queries';

async function recordBillEmailSend(input: {
  billId: string;
  profileId: string;
  periodId: string;
  status: 'sent' | 'failed';
  error?: string | null;
}): Promise<void> {
  try {
    const col = await getCollection('mess_bill_email_sends');
    const now = new Date().toISOString();
    await col.updateOne(
      { bill_id: input.billId },
      {
        $set: {
          bill_id: input.billId,
          profile_id: input.profileId,
          billing_period_id: input.periodId,
          status: input.status,
          error: input.error ?? null,
          sent_at: input.status === 'sent' ? now : null,
          updated_at: now,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          created_at: now,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to upsert mess_bill_email_sends:', err);
  }
}

/** Best-effort publish emails. Missing Resend config must not fail publish. */
export async function notifyBillsPublished(periodId: string): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;

    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    const portalUrl = `${site}/billing`;
    const bills = await getPublishedBillsForEmail(periodId);
    const alreadySent = await getSentMessBillEmailIds(periodId);

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let periodName = bills[0]?.period_name ?? 'Mess bill';

    for (const bill of bills) {
      periodName = bill.period_name || periodName;

      if (alreadySent.has(bill.id)) {
        skippedCount += 1;
        continue;
      }

      if (!bill.email) {
        failedCount += 1;
        await recordBillEmailSend({
          billId: bill.id,
          profileId: bill.profile_id,
          periodId,
          status: 'failed',
          error: 'No email on profile',
        });
        continue;
      }

      try {
        await sendMessBillEmail({
          email: bill.email,
          fullName: bill.full_name || 'Officer',
          billNumber: bill.bill_number,
          periodName: bill.period_name,
          totalAmount: bill.total_amount,
          dueDate: bill.due_date,
          viewUrl: bill.id ? `${site}/billing/${bill.id}/print` : portalUrl,
        });
        sentCount += 1;
        await recordBillEmailSend({
          billId: bill.id,
          profileId: bill.profile_id,
          periodId,
          status: 'sent',
        });
      } catch (err) {
        failedCount += 1;
        await recordBillEmailSend({
          billId: bill.id,
          profileId: bill.profile_id,
          periodId,
          status: 'failed',
          error: err instanceof Error ? (err instanceof Error ? err.message : String(err)) : String(err),
        });
      }
    }

    try {
      const publisher = await getCurrentUser();
      if (publisher?.email) {
        await sendMessBillPublishSummaryEmail({
          email: publisher.email,
          fullName: publisher.displayName ?? undefined,
          periodName,
          sentCount,
          failedCount,
          skippedCount,
          viewUrl: portalUrl,
        });
      }
    } catch (err) {
      console.error('Publish summary email failed:', err);
    }
  } catch (err) {
    console.error('Bill publish email batch failed:', err);
  }
}
