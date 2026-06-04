'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import {
  saveAttendanceAction,
  finalizeAttendanceAction,
  reopenAttendanceAction,
  setDiningInAction,
} from '@/lib/attendance/actions';
import type {
  AttendanceDayView,
  AttendanceMember,
  DiningCandidate,
} from '@/lib/attendance/types';

type Draft = { present: boolean; reason: string };

function memberKey(m: { person_type: string; person_id: string }) {
  return `${m.person_type}:${m.person_id}`;
}

export function AttendanceRoster({
  unitId,
  date,
  view,
  candidates,
  canFinalize,
}: {
  unitId: string;
  date: string;
  view: AttendanceDayView;
  candidates: DiningCandidate[];
  canFinalize: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const finalized = view.status === 'finalized';

  const initial = useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const mem of view.members) {
      m[memberKey(mem)] = {
        present: mem.present,
        reason: mem.reason ?? '',
      };
    }
    return m;
  }, [view.members]);

  const [draft, setDraft] = useState<Record<string, Draft>>(initial);

  const presentCount = Object.values(draft).filter((d) => d.present).length;

  function patch(key: string, next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  }

  function gotoDate(next: string) {
    router.push(`/attendance?date=${next}`);
  }

  function save() {
    const absent = view.members
      .filter((mem) => !draft[memberKey(mem)]?.present)
      .map((mem) => ({
        person_type: mem.person_type,
        person_id: mem.person_id,
        reason: draft[memberKey(mem)]?.reason?.trim() || undefined,
      }));
    startTransition(async () => {
      const res = await saveAttendanceAction({
        unit_id: unitId,
        attendance_date: date,
        absent,
      });
      if ('ok' in res) {
        toast.success('Attendance saved');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save');
      }
    });
  }

  function finalize() {
    startTransition(async () => {
      const res = await finalizeAttendanceAction({
        unit_id: unitId,
        attendance_date: date,
      });
      if ('ok' in res) {
        toast.success('Attendance finalized');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not finalize');
      }
    });
  }

  function reopen() {
    startTransition(async () => {
      const res = await reopenAttendanceAction({
        unit_id: unitId,
        attendance_date: date,
      });
      if ('ok' in res) {
        toast.success('Attendance reopened');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not reopen');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && gotoDate(e.target.value)}
          className="w-44 font-mono tabular-nums text-sm"
        />
        <Badge variant="secondary" className="font-mono tabular-nums text-xs">
          Present:{' '}
          <span className="ml-1 font-semibold">
            {presentCount} / {view.total}
          </span>
        </Badge>
        <Badge
          variant={finalized ? 'default' : 'outline'}
          className="text-xs"
        >
          {finalized ? 'Finalized' : 'Draft'}
        </Badge>
        <div className="flex-1" />
        <ManageDiningDialog candidates={candidates} disabled={pending} />
        {!finalized && (
          <Button onClick={save} disabled={pending} size="sm">
            Save
          </Button>
        )}
        {canFinalize &&
          (finalized ? (
            <Button variant="outline" onClick={reopen} disabled={pending} size="sm">
              Reopen
            </Button>
          ) : (
            <Button variant="outline" onClick={finalize} disabled={pending} size="sm">
              Finalize
            </Button>
          ))}
      </div>

      {/* Roster table */}
      {view.members.length === 0 ? (
        <EmptyRoster />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Member
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="w-28 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Present
                </TableHead>
                <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reason if absent
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.members.map((mem: AttendanceMember) => {
                const k = memberKey(mem);
                const d = draft[k];
                const isPresent = d?.present ?? true;
                return (
                  <TableRow
                    key={k}
                    className="transition-ds hover:bg-muted/40 border-t border-border first:border-t-0"
                  >
                    <TableCell className="px-3 py-2 font-medium text-sm text-foreground">
                      {mem.name}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                      {mem.person_type === 'profile' ? (
                        'Serving'
                      ) : (
                        <span>
                          Dependant
                          {mem.sponsor_name ? ` · ${mem.sponsor_name}` : ''}
                          {mem.relation ? ` (${mem.relation})` : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Switch
                        checked={isPresent}
                        disabled={finalized || pending}
                        onCheckedChange={(v) => patch(k, { present: v })}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Input
                        value={d?.reason ?? ''}
                        disabled={finalized || pending || isPresent}
                        placeholder={isPresent ? '' : 'e.g. on leave'}
                        onChange={(e) => patch(k, { reason: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EmptyRoster() {
  return (
    <EmptyState
      icon={<Users className="size-5" />}
      title="No dining-in members"
      description='Use "Manage dining-in members" to add people to the daily roster.'
    />
  );
}

function ManageDiningDialog({
  candidates,
  disabled,
}: {
  candidates: DiningCandidate[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(c: DiningCandidate, next: boolean) {
    startTransition(async () => {
      const res = await setDiningInAction({
        person_type: c.person_type,
        person_id: c.person_id,
        dining_in: next,
      });
      if ('ok' in res) {
        toast.success(`${c.name} ${next ? 'added' : 'removed'}`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not update');
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Users className="mr-1.5 size-4" />
        Manage dining-in
      </Button>
      <AdaptiveModal
        open={open}
        onClose={() => setOpen(false)}
        title="Dining-in members"
        description="Only flagged members appear in the daily roster."
      >
        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active members in this unit.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {candidates.map((c) => (
                <div
                  key={`${c.person_type}:${c.person_id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 transition-ds hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.person_type === 'profile'
                        ? 'Serving'
                        : `Dependant${c.sponsor_name ? ` · ${c.sponsor_name}` : ''}`}
                    </div>
                  </div>
                  <Switch
                    checked={c.dining_in}
                    disabled={pending}
                    onCheckedChange={(v) => toggle(c, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </AdaptiveModal>
    </>
  );
}
