'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { setUnitConfigAction } from '@/lib/attendance/actions';
import { updateUnitFlatRatesAction } from '@/lib/messing/actions';
import {
  messTypeEnum,
  MESS_TYPE_LABEL,
  type MessType,
} from '@/lib/schemas/attendance';
import {
  rationTerrainEnum,
  RATION_TERRAIN_LABEL,
  type RationTerrain,
} from '@/lib/schemas/ration';
import {
  messingMealTypeEnum,
  MESSING_MEAL_TYPE_LABEL,
  type MessingBillingMode,
  type MessingMealType,
} from '@/lib/schemas/messing';

export function UnitSettingsCard({
  unitId,
  unitName,
  messType,
  terrain,
  messingBillingMode,
  activeFlatRates,
  flatRatesHistory,
}: {
  unitId: string;
  unitName: string;
  messType: MessType | null;
  terrain: RationTerrain | null;
  messingBillingMode: MessingBillingMode;
  activeFlatRates: Record<MessingMealType, number>;
  flatRatesHistory: Array<{
    id: string;
    meal_type: MessingMealType;
    rate: number | string;
    valid_from: string;
    valid_to: string | null;
  }>;
}) {
  const router = useRouter();
  const [mess, setMess] = useState<MessType | undefined>(messType ?? undefined);
  const [terr, setTerr] = useState<RationTerrain | undefined>(
    terrain ?? undefined,
  );
  const [billingMode, setBillingMode] = useState<MessingBillingMode>(
    messingBillingMode,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdatingRates, setIsUpdatingRates] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    mess !== (messType ?? undefined) ||
    terr !== (terrain ?? undefined) ||
    billingMode !== messingBillingMode;

  function save() {
    startTransition(async () => {
      const res = await setUnitConfigAction({
        unit_id: unitId,
        mess_type: mess,
        terrain: terr,
        messing_billing_mode: billingMode,
      });
      if ('ok' in res) {
        toast.success('Unit settings saved');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save');
      }
    });
  }

  async function handleUpdateRates(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsUpdatingRates(true);
    try {
      const formData = new FormData(e.currentTarget);
      const validFrom = formData.get('effectiveDate') as string;
      const rates = messingMealTypeEnum.map((m) => {
        const rateVal = formData.get(`rate-${m}`);
        return {
          meal_type: m,
          rate: Number(rateVal ?? 0),
          valid_from: validFrom,
        };
      });

      const res = await updateUnitFlatRatesAction({
        unit_id: unitId,
        rates,
      });

      if ('ok' in res) {
        toast.success('Flat rates updated successfully');
        setIsDialogOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Failed to update flat rates');
      }
    } catch (err: any) {
      toast.error(err?.message || 'An unexpected error occurred');
    } finally {
      setIsUpdatingRates(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Unit settings</CardTitle>
        <CardDescription>
          Mess type, terrain, and messing billing mode for {unitName}. Together these determine the
          unit&apos;s configuration and rate settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="mess-type" className="text-sm font-medium">Mess type</Label>
            <Select
              value={mess}
              onValueChange={(v) => setMess(v as MessType)}
              disabled={pending}
            >
              <SelectTrigger id="mess-type" className="transition-ds w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {messTypeEnum.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MESS_TYPE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="terrain" className="text-sm font-medium">Terrain</Label>
            <Select
              value={terr}
              onValueChange={(v) => setTerr(v as RationTerrain)}
              disabled={pending}
            >
              <SelectTrigger id="terrain" className="transition-ds w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {rationTerrainEnum.map((t) => (
                  <SelectItem key={t} value={t}>
                    {RATION_TERRAIN_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="billing-mode" className="text-sm font-medium">Billing mode</Label>
            <Select
              value={billingMode}
              onValueChange={(v) => setBillingMode(v as MessingBillingMode)}
              disabled={pending}
            >
              <SelectTrigger id="billing-mode" className="transition-ds w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FLAT_RATE">Flat Rate Messing</SelectItem>
                <SelectItem value="P_REGISTER_SPLIT">P Register Split</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {messingBillingMode === 'FLAT_RATE' && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Flat Rate Settings</h4>
                <p className="text-xs text-muted-foreground">Current active flat rates for this unit.</p>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">Manage Rates</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Manage Flat Rates</DialogTitle>
                    <DialogDescription>
                      Update flat rates for all meal types. New rates will be active starting from the selected effective date.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUpdateRates} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="effective-date">Effective Date</Label>
                      <Input
                        id="effective-date"
                        name="effectiveDate"
                        type="date"
                        required
                        defaultValue={new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {messingMealTypeEnum.map((m) => (
                        <div key={m} className="space-y-1.5">
                          <Label htmlFor={`rate-${m}`} className="text-xs">
                            {MESSING_MEAL_TYPE_LABEL[m]}
                          </Label>
                          <Input
                            id={`rate-${m}`}
                            name={`rate-${m}`}
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            defaultValue={activeFlatRates[m] ?? 0}
                          />
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isUpdatingRates}>
                        {isUpdatingRates ? 'Saving...' : 'Save rates'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {messingMealTypeEnum.map((m) => (
                <div key={m} className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground font-medium">
                    {MESSING_MEAL_TYPE_LABEL[m]}
                  </div>
                  <div className="mt-1 text-base font-bold">
                    ₹{activeFlatRates[m] ?? 0}
                  </div>
                </div>
              ))}
            </div>

            {flatRatesHistory.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="history" className="border-none">
                  <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground hover:no-underline">
                    View Rate History
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mt-2 rounded-md border max-h-[250px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="py-2 text-xs">Meal Type</TableHead>
                            <TableHead className="py-2 text-xs text-right">Rate</TableHead>
                            <TableHead className="py-2 text-xs text-center">Valid From</TableHead>
                            <TableHead className="py-2 text-xs text-center">Valid To</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {flatRatesHistory.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="py-1.5 text-xs font-medium">
                                {MESSING_MEAL_TYPE_LABEL[row.meal_type] ?? row.meal_type}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-right font-semibold">
                                ₹{Number(row.rate).toFixed(2)}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-center text-muted-foreground">
                                {row.valid_from}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-center text-muted-foreground">
                                {row.valid_to ?? 'Active'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end border-t bg-muted/20 px-6 py-4">
        <Button onClick={save} disabled={pending || !dirty} className="transition-ds">
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
