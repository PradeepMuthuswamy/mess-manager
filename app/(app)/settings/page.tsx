import { requireUser } from '@/lib/auth/require-role';
import { getCollection } from '@/lib/mongo';
import { UnitSettingsCard } from './_components/unit-settings-card';
import { BillTemplateCard } from './_components/bill-template-card';
import { PersonalDetailsForm } from './_components/personal-details-form';
import { resolveBillFormatTemplate } from '@/lib/billing/templates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MessType } from '@/lib/schemas/attendance';
import type { RationTerrain } from '@/lib/schemas/ration';
import { getFlatRatesHistory, getActiveFlatRates } from '@/lib/messing/queries';
import type { MessingFlatRateRow } from '@/lib/messing/types';
import type { MessingBillingMode } from '@/lib/schemas/messing';

export default async function SettingsPage() {
  const user = await requireUser();
  const profilesCol = await getCollection('profiles');
  const profile = await profilesCol.findOne(
    { id: user.id },
    { projection: { full_name: 1, service_no: 1, rank: 1, email: 1, date_of_birth: 1, marriage_date: 1 } }
  );

  const canManageUnit = user.role === 'super_admin' || user.role === 'unit_admin';
  const unitId = user.activeUnitId ?? user.homeUnitId;
  type UnitCfg = {
    id: string;
    name: string;
    mess_type: MessType | null;
    terrain: RationTerrain | null;
    messing_billing_mode: MessingBillingMode;
    guest_food_per_night: number;
    auto_ration_post: boolean;
    bill_format_template: string;
    room_bill_format_template: string;
  };
  let unit: UnitCfg | null = null;
  let activeFlatRates: Record<string, number> = {};
  let flatRatesHistory: MessingFlatRateRow[] = [];
  if (canManageUnit && unitId) {
    const unitsCol = await getCollection('units');
    const data = await unitsCol.findOne({ id: unitId });
    if (data) {
      unit = {
        id: String(data.id || data._id),
        name: String(data.name),
        mess_type: data.mess_type ?? null,
        terrain: data.terrain ?? null,
        messing_billing_mode: (data.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT',
        guest_food_per_night: Number(data.guest_food_per_night ?? 900),
        auto_ration_post: Boolean(data.auto_ration_post),
        bill_format_template: data.bill_format_template ?? 'classic',
        room_bill_format_template: data.room_bill_format_template ?? 'classic',
      };
      const today = new Date().toISOString().slice(0, 10);
      activeFlatRates = await getActiveFlatRates(unitId, today);
      flatRatesHistory = await getFlatRatesHistory(unitId);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Profile &amp; settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your personal details and application preferences.</p>
      </div>

      {unit && (
        <UnitSettingsCard
          unitId={unit.id}
          unitName={unit.name}
          messType={unit.mess_type}
          terrain={unit.terrain}
          messingBillingMode={unit.messing_billing_mode}
          guestFoodPerNight={Number(unit.guest_food_per_night ?? 900)}
          autoRationPost={Boolean(unit.auto_ration_post)}
          activeFlatRates={activeFlatRates}
          flatRatesHistory={flatRatesHistory}
        />
      )}

      {canManageUnit && unit && (
        <BillTemplateCard
          unitId={unit.id}
          unitName={unit.name}
          billFormatTemplate={resolveBillFormatTemplate(unit.bill_format_template)}
          roomBillFormatTemplate={resolveBillFormatTemplate(unit.room_bill_format_template)}
        />
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Your rank, name, and service number as recorded in the mess roll.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalDetailsForm
            email={profile?.email ?? user.email ?? ''}
            fullName={profile?.full_name ?? ''}
            rank={profile?.rank ?? ''}
            serviceNo={profile?.service_no ?? ''}
            dateOfBirth={profile?.date_of_birth ?? ''}
            marriageDate={profile?.marriage_date ?? ''}
          />
        </CardContent>
      </Card>
    </div>
  );
}
