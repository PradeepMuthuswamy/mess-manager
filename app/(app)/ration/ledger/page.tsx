import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import {
  listEligibleItems,
  getRationStockReport,
  listRationStockTransactions,
} from '@/lib/ration/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { LedgerClient } from './_components/ledger-client';

export const dynamic = 'force-dynamic';

export default async function RationLedgerPage() {
  const user = await requireUser();
  await requireCapability('ration.read', user.activeUnitId ?? undefined);

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Stock Ledger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage bulk ration receipts and running stock balances for the unit.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit and view the stock ledger."
        />
      </section>
    );
  }

  const unitId = user.activeUnitId;

  const [eligibleItems, reportRows, transactions] = await Promise.all([
    listEligibleItems(unitId),
    getRationStockReport(unitId),
    listRationStockTransactions(unitId),
  ]);

  const canWrite = userHasCapability(user, 'ration.adjust', unitId);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Stock Ledger
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage bulk ration receipts, adjustments, and running stock balances for this unit.
        </p>
      </header>

      <LedgerClient
        unitId={unitId}
        eligibleItems={eligibleItems}
        reportRows={reportRows}
        transactions={transactions}
        canWrite={canWrite}
      />
    </section>
  );
}
