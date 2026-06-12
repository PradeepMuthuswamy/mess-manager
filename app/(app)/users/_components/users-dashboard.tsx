'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  ShieldAlert,
  KeyRound,
  Users,
} from 'lucide-react';

import { useAppContext } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { userHasCapability } from '@/lib/auth/capabilities';

import {
  fetchUnitUsersAction,
  toggleUserActiveAction,
  deleteUserAction,
} from '@/lib/users/actions';
import { UserFormDialog } from './user-form-dialog';
import { capabilityDomainLabel } from '@/lib/auth/types';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  selectUsersUi,
  openInvite,
  openEdit,
  closeForm,
} from '@/lib/redux/users/slice';

interface UsersDashboardProps {
  initialUsers: any[];
  initialUnits: any[];
  initialTemplates: any[];
}

export function UsersDashboard({
  initialUsers,
  initialUnits,
  initialTemplates,
}: UsersDashboardProps) {
  const router = useRouter();
  const { user: currentUser, activeUnitId } = useAppContext();
  const dispatch = useAppDispatch();
  const { isFormOpen, editingUser } = useAppSelector(selectUsersUi);

  // State
  const [users, setUsers] = useState<any[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isPending, startTransition] = useTransition();

  // Keep state synced when server component feeds new props
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const handleRefresh = async () => {
    const res = await fetchUnitUsersAction(activeUnitId);
    if (res.ok && res.data) {
      setUsers(res.data);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    startTransition(async () => {
      const targetStatus = !currentStatus;
      const res = await toggleUserActiveAction(userId, targetStatus);
      if (res.ok) {
        toast.success(targetStatus ? 'User account activated.' : 'User account deactivated.');
        handleRefresh();
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to toggle account status.');
      }
    });
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete user ${email}? This action cannot be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteUserAction(userId);
      if (res.ok) {
        toast.success('User deleted successfully.');
        handleRefresh();
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to delete user.');
      }
    });
  };

  const handleOpenEdit = (user: any) => {
    dispatch(openEdit({ user }));
  };

  const handleOpenInvite = () => {
    dispatch(openInvite({ activeUnitId }));
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const fullName = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const serviceNo = (u.service_no || '').toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        fullName.includes(query) || email.includes(query) || serviceNo.includes(query);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && u.is_active) ||
        (statusFilter === 'deactivated' && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Authorization checks
  const canInvite = userHasCapability(currentUser, 'users.invite');
  const canManage = userHasCapability(currentUser, 'users.manage');

  const formatRole = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'unit_admin':
        return 'Unit Admin';
      case 'mess_secretary':
        return 'Mess Secretary';
      case 'mess_havildar':
        return 'Mess Havildar';
      case 'bar_nco':
        return 'Bar NCO';
      case 'property_nco':
        return 'Property NCO';
      case 'manager':
        return 'Manager';
      case 'user':
        return 'Member';
      default:
        return role;
    }
  };

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'unit_admin':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'mess_secretary':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
      case 'mess_havildar':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'bar_nco':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'property_nco':
        return 'bg-pink-500/10 text-pink-500 border-pink-500/20';
      case 'manager':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/20';
      default:
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Filters */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none"
        >
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="unit_admin">Unit Admin</option>
          <option value="mess_secretary">Mess Secretary</option>
          <option value="mess_havildar">Mess Havildar</option>
          <option value="bar_nco">Bar NCO</option>
          <option value="property_nco">Property NCO</option>
          <option value="manager">Manager</option>
          <option value="user">Member</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </select>

        <div className="flex-1" />

        {canInvite && (
          <Button onClick={handleOpenInvite} className="transition-ds press">
            <Plus className="size-4 mr-1" /> Invite User
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-md border border-border shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                User
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Service No
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Role
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities Summary
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-10 px-3 py-2">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    title="No users found"
                    description="Try adjusting your search query or filters."
                    className="rounded-none border-0"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === currentUser.id;
                
                // Get unique domains from user's capabilities
                const capabilityList = u.user_capabilities || [];
                const uniqueDomains = Array.from(
                  new Set(capabilityList.map((uc: any) => capabilityDomainLabel(uc.capability as any)))
                );

                const displayName = u.display_name || u.full_name || u.email;
                const initials = displayName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <TableRow
                    key={u.id}
                    className="border-b border-border transition-ds last:border-0 hover:bg-muted/40"
                  >
                    {/* User profile with Avatar */}
                    <TableCell className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 bg-slate-200">
                          <AvatarFallback className="text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {u.rank ? `${u.rank} ` : ''}
                              {u.full_name || 'No name'}
                            </span>
                            {isSelf && (
                              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                                You
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground block">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Service No */}
                    <TableCell className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {u.service_no || '—'}
                    </TableCell>

                    {/* Role */}
                    <TableCell className="px-3 py-3">
                      <Badge variant="outline" className={getRoleBadgeClasses(u.role)}>
                        {formatRole(u.role)}
                      </Badge>
                    </TableCell>

                    {/* Capabilities summary domains */}
                    <TableCell className="px-3 py-3">
                      {uniqueDomains.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No capabilities</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {uniqueDomains.slice(0, 3).map((d: any) => (
                            <Badge key={d} variant="secondary" className="text-[10px] py-0">
                              {d}
                            </Badge>
                          ))}
                           {uniqueDomains.length > 3 && (
                             <Badge
                               variant="outline"
                               className="text-[10px] py-0 cursor-default"
                               title={`Assigned Areas:\n${uniqueDomains.map(d => `• ${d}`).join('\n')}`}
                             >
                               +{uniqueDomains.length - 3} more
                             </Badge>
                           )}
                        </div>
                      )}
                    </TableCell>

                    {/* Status active/inactive */}
                    <TableCell className="px-3 py-3">
                      <Badge
                        variant={u.is_active ? 'secondary' : 'destructive'}
                        className={`text-[10px] ${
                          u.is_active
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </Badge>
                    </TableCell>

                    {/* Actions Dropdown */}
                    <TableCell className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open action menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {isSelf ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1">
                              <ShieldAlert className="size-3" /> Cannot modify self account
                            </div>
                          ) : (
                            <>
                              {canManage && (
                                <DropdownMenuItem onClick={() => handleOpenEdit(u)}>
                                  <Pencil className="size-4 mr-2" /> Edit Member
                                </DropdownMenuItem>
                              )}
                              {canManage && (
                                <DropdownMenuItem
                                  onClick={() => handleToggleActive(u.id, u.is_active)}
                                  className={u.is_active ? 'text-destructive' : 'text-emerald-600'}
                                >
                                  {u.is_active ? (
                                    <>
                                      <UserX className="size-4 mr-2" /> Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="size-4 mr-2" /> Activate
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}
                              {canManage && (
                                <DropdownMenuItem
                                  onClick={() => handleDeleteUser(u.id, u.email)}
                                  className="text-destructive font-semibold"
                                >
                                  <Trash2 className="size-4 mr-2" /> Delete Account
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Forms Modal */}
      {isFormOpen && (
        <UserFormDialog
          open={isFormOpen}
          onClose={() => {
            dispatch(closeForm());
            handleRefresh();
          }}
          user={editingUser}
          units={initialUnits}
          templates={initialTemplates}
        />
      )}
    </div>
  );
}
