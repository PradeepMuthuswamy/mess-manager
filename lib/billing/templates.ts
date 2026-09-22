import type { BillFormatTemplate } from '@/lib/schemas/billing';

export type { BillFormatTemplate };

export const DEFAULT_BILL_FORMAT_TEMPLATE: BillFormatTemplate = 'classic';

export const BILL_FORMAT_LABELS: Record<BillFormatTemplate, string> = {
  classic: 'Classic',
  compact: 'Compact',
  formal: 'Formal',
};

export function resolveBillFormatTemplate(
  value: string | null | undefined,
): BillFormatTemplate {
  if (value === 'classic' || value === 'compact' || value === 'formal') {
    return value;
  }
  return DEFAULT_BILL_FORMAT_TEMPLATE;
}
