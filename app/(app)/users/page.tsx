import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { getCollection } from '@/lib/mongo';
import { fetchUnitUsersAction, fetchCapabilityTemplatesAction } from '@/lib/users/actions';
import { UsersDashboard } from './_components/users-dashboard';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requireUser();
  await requireCapability('users.read', user.activeUnitId);

  const unitsCol = await getCollection('units');
  const [usersRes, templatesRes, rawUnits] = await Promise.all([
    fetchUnitUsersAction(user.activeUnitId),
    fetchCapabilityTemplatesAction(),
    unitsCol.find({ is_active: { $ne: false } }).sort({ name: 1 }).toArray(),
  ]);

  const initialUsers = usersRes.ok && usersRes.data ? usersRes.data : [];
  const templates = templatesRes.ok && templatesRes.data ? templatesRes.data : [];
  const units = rawUnits.map((u: Record<string, unknown>) => ({ id: u.id, name: u.name }));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
          User Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage user profiles, roles, active status, and custom capability permissions for this unit.
        </p>
      </div>

      <UsersDashboard
        initialUsers={initialUsers as Record<string, unknown>[]}
        initialUnits={units}
        initialTemplates={templates as Record<string, unknown>[]}
      />
    </section>
  );
}
