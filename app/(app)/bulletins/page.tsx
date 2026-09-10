import { requireUser } from '@/lib/auth/require-role';
import { listUnitBulletins } from '@/lib/bulletins/queries';
import { PublishBulletinForm } from '../dashboard/_components/publish-bulletin-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { Megaphone } from 'lucide-react';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function BulletinsPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const canPublish = user.role === 'unit_admin' || user.role === 'mess_secretary';

  if (!unitId) {
    return (
      <EmptyState
        icon={<Megaphone className="size-5" />}
        title="No active unit"
        description="Assign a unit to read mess bulletins."
      />
    );
  }

  const bulletins = await listUnitBulletins(unitId).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Unit notices</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          Mess bulletins
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official notices for every member of this unit.
        </p>
      </div>

      {canPublish && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-heading text-base">Publish a notice</CardTitle>
            <CardDescription>Visible to all members on the dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <PublishBulletinForm unitId={unitId} />
          </CardContent>
        </Card>
      )}

      {bulletins.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="No bulletins yet"
          description="When the Mess Secretary publishes a notice, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {bulletins.map((item) => (
            <Card key={item.id} className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-base">{item.title}</CardTitle>
                <CardDescription>
                  {format(new Date(item.published_at), 'dd MMM yyyy, HH:mm')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-foreground">{item.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
