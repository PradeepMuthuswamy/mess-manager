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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateUnitBillTemplateAction } from '@/lib/billing/template-actions';
import { BILL_FORMAT_LABELS } from '@/lib/billing/templates';
import {
  billFormatTemplateEnum,
  type BillFormatTemplate,
} from '@/lib/schemas/billing';

const BILL_FORMAT_HINTS: Record<BillFormatTemplate, string> = {
  classic: 'Section tiles and a full line-item statement.',
  compact: 'Dense single-page layout for printers.',
  formal: 'Official layout with PMC and Secretary signatory blocks.',
};

export function BillTemplateCard({
  unitId,
  unitName,
  billFormatTemplate,
  roomBillFormatTemplate,
}: {
  unitId: string;
  unitName: string;
  billFormatTemplate: BillFormatTemplate;
  roomBillFormatTemplate: BillFormatTemplate;
}) {
  const router = useRouter();
  const [billFormat, setBillFormat] =
    useState<BillFormatTemplate>(billFormatTemplate);
  const [roomFormat, setRoomFormat] =
    useState<BillFormatTemplate>(roomBillFormatTemplate);
  const [pending, startTransition] = useTransition();

  const dirty =
    billFormat !== billFormatTemplate || roomFormat !== roomBillFormatTemplate;

  function save() {
    startTransition(async () => {
      const res = await updateUnitBillTemplateAction({
        unit_id: unitId,
        bill_format_template: billFormat,
        room_bill_format_template: roomFormat,
      });
      if ('ok' in res) {
        toast.success('Bill format saved');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Bill formats</CardTitle>
        <CardDescription>
          Print and PDF layout for mess bills and guest-room statements at {unitName}.
          Presentation only — amounts are unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bill-format" className="text-sm font-medium">
              Mess bill
            </Label>
            <Select
              value={billFormat}
              onValueChange={(v) => setBillFormat(v as BillFormatTemplate)}
              disabled={pending}
            >
              <SelectTrigger id="bill-format" className="transition-ds w-full">
                <SelectValue placeholder="Select layout" />
              </SelectTrigger>
              <SelectContent>
                {billFormatTemplateEnum.map((tpl) => (
                  <SelectItem key={tpl} value={tpl}>
                    {BILL_FORMAT_LABELS[tpl]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{BILL_FORMAT_HINTS[billFormat]}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="room-bill-format" className="text-sm font-medium">
              Room bill
            </Label>
            <Select
              value={roomFormat}
              onValueChange={(v) => setRoomFormat(v as BillFormatTemplate)}
              disabled={pending}
            >
              <SelectTrigger id="room-bill-format" className="transition-ds w-full">
                <SelectValue placeholder="Select layout" />
              </SelectTrigger>
              <SelectContent>
                {billFormatTemplateEnum.map((tpl) => (
                  <SelectItem key={tpl} value={tpl}>
                    {BILL_FORMAT_LABELS[tpl]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{BILL_FORMAT_HINTS[roomFormat]}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end border-t bg-muted/20 px-6 py-4">
        <Button onClick={save} disabled={pending || !dirty} className="transition-ds">
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
