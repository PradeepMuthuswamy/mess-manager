import { requireUser } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { readUiPreferences } from '@/lib/preferences/cookie';
import { UiPreferencesCard } from './_components/ui-preferences-card';
import { UnitSettingsCard } from './_components/unit-settings-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MessType } from '@/lib/schemas/attendance';
import type { RationTerrain } from '@/lib/schemas/ration';

async function updateProfileAction(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('profiles')
    .update({
      full_name: String(formData.get('full_name') ?? '').trim() || null,
      service_no: String(formData.get('service_no') ?? '').trim() || null,
      rank: String(formData.get('rank') ?? '').trim() || null,
    })
    .eq('id', user.id);
  revalidatePath('/settings');
}

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, service_no, rank, email')
    .eq('id', user.id)
    .single();
  const uiPrefs = await readUiPreferences();

  const canManageUnit = user.role === 'admin' || user.role === 'unit_admin';
  const unitId = user.activeUnitId ?? user.homeUnitId;
  type UnitCfg = {
    id: string;
    name: string;
    mess_type: MessType | null;
    terrain: RationTerrain | null;
  };
  let unit: UnitCfg | null = null;
  if (canManageUnit && unitId) {
    const { data } = await supabase
      .from('units')
      .select('id, name, mess_type, terrain')
      .eq('id', unitId)
      .single();
    if (data) unit = data as UnitCfg;
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
        />
      )}

      <UiPreferencesCard prefs={uiPrefs} />

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
