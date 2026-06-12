'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreateChitDialog } from './create-chit-dialog';
import { format } from 'date-fns';
import { 
  Martini, 
  Plus, 
  Receipt, 
  AlertTriangle, 
  TrendingUp, 
  Calendar, 
  User, 
  GlassWater, 
  Users 
} from 'lucide-react';
import { type BarChitRow } from '@/lib/bar/queries';
import { cn } from '@/lib/utils';

type InventoryItem = {
  id: string | null;
  item_id: string | null;
  item_name: string | null;
  qty_packs: number | string | null;
  rate: number | string | null;
  pack_label: string | null;
  category: string | null;
  volume_ml?: number | string | null;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  rank: string | null;
  service_no: string | null;
};

type ActiveBooking = {
  id: string;
  guest_name: string;
  room_name: string;
  status: string;
};

interface BarClientProps {
  unitId: string;
  inventory: InventoryItem[];
  recentChits: BarChitRow[];
  members: Member[];
  bookings: ActiveBooking[];
  canWrite: boolean;
}

export function BarClient({
  unitId,
  inventory,
  recentChits,
  members,
  bookings,
  canWrite,
}: BarClientProps) {
  const [openChitDialog, setOpenChitDialog] = useState(false);

  // Compute stats
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayChits = recentChits.filter(c => c.date.startsWith(todayStr));
    const salesToday = todayChits.reduce((sum, c) => sum + Number(c.total_amount), 0);
    const lowStockItems = inventory.filter(i => Number(i.qty_packs) <= 2);

    return {
      todayChitCount: todayChits.length,
      salesToday,
      lowStockCount: lowStockItems.length,
      totalInventoryItems: inventory.length
    };
  }, [recentChits, inventory]);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Bar Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage bar chit logs, member and guest consumption, and real-time inventory levels.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setOpenChitDialog(true)} className="gap-2 transition-transform hover:scale-105 active:scale-95 shadow-md">
            <Plus className="size-4" />
            Create Bar Chit
          </Button>
        )}
      </div>

      {/* Stats Widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sales Today</CardTitle>
            <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ₹{stats.salesToday.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From {stats.todayChitCount} {stats.todayChitCount === 1 ? 'chit' : 'chits'} logged today
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Log Activity</CardTitle>
            <Receipt className="size-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentChits.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total recorded chits this month</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Stock</CardTitle>
            <Martini className="size-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInventoryItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique alcohol & cigar variants on hand</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Alerts</CardTitle>
            <AlertTriangle className={cn(
              "size-4",
              stats.lowStockCount > 0 ? "text-amber-500 animate-pulse" : "text-muted-foreground"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              stats.lowStockCount > 0 ? "text-amber-500" : "text-foreground"
            )}>
              {stats.lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Items with 2 or fewer packs remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Chits Section (takes 2 cols) */}
        <Card className="lg:col-span-2 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">Recent Consumption Logs</CardTitle>
              <p className="text-xs text-muted-foreground">Last recorded chits in the bar registry.</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentChits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="size-8 text-muted-foreground/40 mb-3" />
                <h3 className="font-semibold text-sm">No chits recorded</h3>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Create a new chit to log consumption details.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6 w-[120px]">Date</TableHead>
                      <TableHead>Consumer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center pr-6 w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentChits.map((chit) => {
                      const isMember = !!chit.profile;
                      const consumerLabel = isMember 
                        ? `${chit.profile?.rank ? `${chit.profile.rank} ` : ''}${chit.profile?.full_name}`
                        : `${chit.guest_name} (Guest${chit.booking?.room?.name ? `, Rm ${chit.booking.room.name}` : ''})`;

                      return (
                        <TableRow key={chit.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium pl-6 text-sm">
                            {format(new Date(chit.date), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isMember ? (
                                <Users className="size-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <User className="size-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-medium text-sm line-clamp-1">{consumerLabel}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                              {chit.items.map((line, idx) => (
                                <span key={line.id || idx}>
                                  {line.variant?.product?.name} × {Number(line.quantity)}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            ₹{Number(chit.total_amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center pr-6">
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize h-5 text-[10px] px-2 font-medium border",
                                chit.status === 'finalized'
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                              )}
                            >
                              {chit.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Inventory Section (takes 1 col) */}
        <Card className="shadow-xs">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">Available Stock</CardTitle>
              <p className="text-xs text-muted-foreground">On-hand alcohol and cigar inventory levels.</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <GlassWater className="size-8 text-muted-foreground/40 mb-3" />
                <h3 className="font-semibold text-sm">No stock registered</h3>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Add lots in the main Inventory panel to view stock here.
                </p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto pr-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Item</TableHead>
                      <TableHead className="text-right pr-6">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((item) => {
                      const qty = Number(item.qty_packs);
                      const isLow = qty <= 2;
                      let vol = Number((item as any).volume_ml ?? 0);
                      if (vol <= 0 && item.category === 'alcohol' && item.pack_label?.toUpperCase().includes('BOTTLE')) {
                        vol = 750;
                      }
                      const isAlcohol = item.category === 'alcohol';
                      const pegsPerBottle = vol > 0 ? vol / 30 : 0;
                      
                      // Format the float nicely to avoid floating-point issues, and strip trailing zeros
                      const formattedQty = parseFloat(qty.toFixed(3)).toString();
                      const displayQty = isAlcohol && pegsPerBottle > 0
                        ? `${formattedQty} (${Math.round(qty * pegsPerBottle)} pegs)`
                        : formattedQty;

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="pl-6 py-3">
                            <div className="font-medium text-sm">{item.item_name}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <Badge variant="secondary" className="text-[9px] h-4.5 px-1 py-0 capitalize">
                                {item.category}
                              </Badge>
                              <span>({item.pack_label})</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-3">
                            <div className={cn("font-bold text-sm", isLow ? "text-amber-500" : "text-foreground")}>
                              {displayQty}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              ₹{Number(item.rate).toFixed(2)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chit Creation Modal */}
      {openChitDialog && (
        <CreateChitDialog
          open={openChitDialog}
          onClose={() => setOpenChitDialog(false)}
          unitId={unitId}
          inventory={inventory}
          members={members}
          bookings={bookings}
        />
      )}
    </div>
  );
}
