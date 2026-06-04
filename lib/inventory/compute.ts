/**
 * Pure inventory cost/quantity math. No DB, no app concerns.
 *
 * Servings are NOT stored. They are derived from a category serving
 * standard plus the pack-size master: a peg is a fixed 30 ml measure,
 * a "Box of 20" carries its count on the pack. `derivedUnitsPerPack`
 * turns (category, pack) into servings-per-pack; the cost/quantity
 * helpers below take that derived value where a stored column used to
 * sit. Null/0 servings-per-pack means the pack is indivisible: one
 * serving = one pack.
 */

/** A peg is a fixed 30 ml measure (code constant, not user input). */
export const PEG_ML = 30;

/**
 * Servings per pack derived from the category standard and pack master.
 *
 * - `alcohol`     → `volume_ml / PEG_ML` (30 ml pegs); null/≤0 ⇒ null
 * - `soft_drink`  → `1` (issued per whole bottle/can)
 * - `cigar`       → `unit_count` (box count from the pack); null/≤0 ⇒ null
 * - `grocery`     → `1` (whole pack/unit only)
 * - anything else → `null` (treated as an indivisible whole pack)
 *
 * Pure and defensive: invalid/missing measures yield `null`, never throw.
 */
export function derivedUnitsPerPack(
  category: string,
  pack: { kind: string | null; volume_ml: number | null; unit_count: number | null },
): number | null {
  switch (category) {
    case "alcohol":
      return pack.volume_ml && pack.volume_ml > 0
        ? pack.volume_ml / PEG_ML
        : null;
    case "soft_drink":
      return 1;
    case "cigar":
      return pack.unit_count && pack.unit_count > 0 ? pack.unit_count : null;
    case "grocery":
      return 1;
    default:
      return null;
  }
}

/**
 * Singular serving label for a category. Callers pluralize.
 * alcohol→peg, soft_drink→bottle, cigar→stick, grocery→unit, default→unit.
 */
export function servingLabel(category: string): string {
  switch (category) {
    case "alcohol":
      return "peg";
    case "soft_drink":
      return "bottle";
    case "cigar":
      return "stick";
    case "grocery":
      return "unit";
    default:
      return "unit";
  }
}

/**
 * Singular noun for ONE purchased container of this category/pack — what the
 * user actually buys and counts (a bottle, a can, a box, a pack). Purely
 * presentational: the DB still stores `qty_packs`. Callers pluralize via
 * `pluralize`.
 *
 * - `alcohol`     → `bottle`
 * - `soft_drink`  → `can` if the pack label mentions "can", else `bottle`
 * - `cigar`       → `box`
 * - `grocery`     → `pack` (the correct noun here, not jargon)
 * - anything else → `pack`
 *
 * Pure and defensive: a null/absent label just falls back to the
 * category default (e.g. soft_drink ⇒ bottle).
 */
export function containerLabel(
  category: string,
  pack: { kind: string | null; label: string | null },
): string {
  switch (category) {
    case "alcohol":
      return "bottle";
    case "soft_drink":
      return pack.label && pack.label.toLowerCase().includes("can")
        ? "can"
        : "bottle";
    case "cigar":
      return "box";
    case "grocery":
      return "pack";
    default:
      return "pack";
  }
}

/**
 * Pluralize a noun by count. `n === 1` ⇒ the singular word; otherwise add
 * `-es` for sibilant endings (s, x, z, ch, sh) so "box" ⇒ "boxes", else
 * `-s`. Covers every inventory noun in use (bottle/can/box/pack/peg/stick);
 * true irregulars are not needed here.
 */
export function pluralize(n: number, singular: string): string {
  if (n === 1) return singular;
  return /(?:s|x|z|ch|sh)$/i.test(singular) ? `${singular}es` : `${singular}s`;
}

/**
 * Cost of a single serving drawn from a lot.
 * `rate / units_per_pack`; whole/indivisible pack ⇒ the full rate.
 */
export function costPerServing(
  rate: number,
  unitsPerPack: number | null,
): number {
  return unitsPerPack && unitsPerPack > 0 ? rate / unitsPerPack : rate;
}

/** Total servings available across `qtyPacks` packs. Null upp ⇒ 1 serving/pack. */
export function servingsOnHand(
  qtyPacks: number,
  unitsPerPack: number | null,
): number {
  return qtyPacks * (unitsPerPack ?? 1);
}

/** Money tied up in a lot: packs on hand × pack rate. */
export function lotValue(qtyPacks: number, rate: number): number {
  return qtyPacks * rate;
}

/** Cost of consuming `servings` from a lot at this lot's rate. */
export function consumeCost(
  servings: number,
  rate: number,
  unitsPerPack: number | null,
): number {
  return servings * costPerServing(rate, unitsPerPack);
}
