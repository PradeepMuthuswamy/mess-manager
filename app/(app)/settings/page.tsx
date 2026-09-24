import { requireUser } from '@/lib/auth/require-role';
import { getCollection } from '@/lib/mongo';
import { revalidatePath } from 'next/cache';
import { UnitSettingsCard } from './_components/unit-settings-card';
import { BillTemplateCard } from './_components/bill-template-card';
import { resolveBillFormatTemplate } from '@/lib/billing/templates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MessType } from '@/lib/schemas/attendance';
import type { RationTerrain } from '@/lib/schemas/ration';
import { getFlatRatesHistory, getActiveFlatRates } from '@/lib/messing/queries';
import type { MessingFlatRateRow } from '@/lib/messing/types';
import type { MessingBillingMode } from '@/lib/schemas/messing';

function optionalIsoDate(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

async function updateProfileAction(formData: FormData) {
  'use server';
  const user = await requireUser();
  const col = await getCollection('profiles');
  await col.updateOne(
    { id: user.id },
    {
      $set: {
        full_name: String(formData.get('full_name') ?? '').trim() || null,
        service_no: String(formData.get('service_no') ?? '').trim() || null,
        rank: String(formData.get('rank') ?? '').trim() || null,
        date_of_birth: optionalIsoDate(formData.get('date_of_birth')),
        marriage_date: optionalIsoDate(formData.get('marriage_date')),
        updated_at: new Date().toISOString(),
      },
    }
  );
  revalidatePath('/settings');
  revalidatePath('/calendar');
}

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
          <form action={updateProfileAction} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                disabled
                value={profile?.email ?? user.email}
                readOnly
              />
              <p className="text-sm text-muted-foreground">Sign-in address — cannot be changed here.</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="full_name">
                Full name
              </label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile?.full_name ?? ''}
                placeholder="As it appears on your ID card"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="rank">
                  Rank
                </label>
                <Input
                  id="rank"
                  name="rank"
                  defaultValue={profile?.rank ?? ''}
                  placeholder="e.g. Lieutenant Colonel"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="service_no">
                  Service no.
                </label>
                <Input
                  id="service_no"
                  name="service_no"
                  defaultValue={profile?.service_no ?? ''}
                  placeholder="e.g. IC-12345"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="date_of_birth">
                  Date of birth
                </label>
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  defaultValue={profile?.date_of_birth ?? ''}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="marriage_date">
                  Marriage date
                </label>
                <Input
                  id="marriage_date"
                  name="marriage_date"
                  type="date"
                  defaultValue={profile?.marriage_date ?? ''}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to generate birthday and anniversary entries on the unit social calendar.
            </p>

            <div className="flex justify-end pt-2">
              <Button type="submit" className="transition-ds">
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
