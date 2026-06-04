// Single source of truth for the unit `mess_type` → ration `rank_class`
// mapping. NOT marked `server-only` so server pages and any client component
// can share it. `officer|jco|or` map 1:1 to a rank class; `combined` (and an
// unset mess type) span multiple classes and so map to `null` — callers fall
// back to the full rank-class selector in that case.

import type { MessType } from '@/lib/schemas/attendance';
import type { RationClass } from '@/lib/schemas/ration';

export function rankClassForMessType(
  m: MessType | null | undefined,
): RationClass | null {
  switch (m) {
    case 'officer':
    case 'jco':
    case 'or':
      return m;
    default:
      // 'combined', null, undefined — not a single rank class.
      return null;
  }
}
