import { describe, expect, it } from "vitest";

import {
  PEG_ML,
  consumeCost,
  containerLabel,
  costPerServing,
  derivedUnitsPerPack,
  lotValue,
  pluralize,
  servingLabel,
  servingsOnHand,
} from "./compute";

describe("PEG_ML", () => {
  it("is the fixed 30 ml peg standard", () => {
    expect(PEG_ML).toBe(30);
  });
});

describe("derivedUnitsPerPack", () => {
  it("alcohol 750 ml ⇒ 25 pegs", () => {
    expect(
      derivedUnitsPerPack("alcohol", {
        kind: "volume",
        volume_ml: 750,
        unit_count: null,
      }),
    ).toBe(25);
  });

  it("alcohol 1 L ⇒ 33.33… pegs (exact decimal, not floored)", () => {
    expect(
      derivedUnitsPerPack("alcohol", {
        kind: "volume",
        volume_ml: 1000,
        unit_count: null,
      }),
    ).toBeCloseTo(33.333, 2);
  });

  it("alcohol with null volume_ml ⇒ null (indivisible)", () => {
    expect(
      derivedUnitsPerPack("alcohol", {
        kind: "volume",
        volume_ml: null,
        unit_count: null,
      }),
    ).toBeNull();
  });

  it("alcohol with 0/negative volume_ml ⇒ null", () => {
    expect(
      derivedUnitsPerPack("alcohol", {
        kind: "volume",
        volume_ml: 0,
        unit_count: null,
      }),
    ).toBeNull();
    expect(
      derivedUnitsPerPack("alcohol", {
        kind: "volume",
        volume_ml: -750,
        unit_count: null,
      }),
    ).toBeNull();
  });

  it("soft_drink ⇒ 1 (whole bottle/can, never subdivides)", () => {
    expect(
      derivedUnitsPerPack("soft_drink", {
        kind: "volume",
        volume_ml: 2000,
        unit_count: null,
      }),
    ).toBe(1);
  });

  it("cigar Box of 20 ⇒ 20 sticks", () => {
    expect(
      derivedUnitsPerPack("cigar", {
        kind: "count",
        volume_ml: null,
        unit_count: 20,
      }),
    ).toBe(20);
  });

  it("cigar with null unit_count ⇒ null (indivisible)", () => {
    expect(
      derivedUnitsPerPack("cigar", {
        kind: "count",
        volume_ml: null,
        unit_count: null,
      }),
    ).toBeNull();
  });

  it("cigar with 0/negative unit_count ⇒ null", () => {
    expect(
      derivedUnitsPerPack("cigar", {
        kind: "count",
        volume_ml: null,
        unit_count: 0,
      }),
    ).toBeNull();
  });

  it("grocery ⇒ 1 (whole pack/unit only)", () => {
    expect(
      derivedUnitsPerPack("grocery", {
        kind: "count",
        volume_ml: null,
        unit_count: 50,
      }),
    ).toBe(1);
  });

  it("unknown category ⇒ null (treated as indivisible whole pack)", () => {
    expect(
      derivedUnitsPerPack("ration", {
        kind: "volume",
        volume_ml: 1000,
        unit_count: null,
      }),
    ).toBeNull();
  });
});

describe("servingLabel", () => {
  it("alcohol ⇒ peg", () => {
    expect(servingLabel("alcohol")).toBe("peg");
  });

  it("soft_drink ⇒ bottle", () => {
    expect(servingLabel("soft_drink")).toBe("bottle");
  });

  it("cigar ⇒ stick", () => {
    expect(servingLabel("cigar")).toBe("stick");
  });

  it("grocery ⇒ unit", () => {
    expect(servingLabel("grocery")).toBe("unit");
  });

  it("unknown category ⇒ unit (default)", () => {
    expect(servingLabel("ration")).toBe("unit");
  });
});

describe("containerLabel", () => {
  it("alcohol ⇒ bottle", () => {
    expect(containerLabel("alcohol", { kind: "volume", label: "750 ml" })).toBe(
      "bottle",
    );
  });

  it("soft_drink '250 ml can' ⇒ can (case-insensitive)", () => {
    expect(
      containerLabel("soft_drink", { kind: "volume", label: "250 ml Can" }),
    ).toBe("can");
  });

  it("soft_drink '2 L (PET)' ⇒ bottle (no 'can' in label)", () => {
    expect(
      containerLabel("soft_drink", { kind: "volume", label: "2 L (PET)" }),
    ).toBe("bottle");
  });

  it("soft_drink with null label ⇒ bottle (category default)", () => {
    expect(
      containerLabel("soft_drink", { kind: "volume", label: null }),
    ).toBe("bottle");
  });

  it("cigar ⇒ box", () => {
    expect(
      containerLabel("cigar", { kind: "count", label: "Box of 20" }),
    ).toBe("box");
  });

  it("grocery ⇒ pack (correct noun, not jargon)", () => {
    expect(
      containerLabel("grocery", { kind: "count", label: "Pack of 12" }),
    ).toBe("pack");
  });

  it("unknown category ⇒ pack (default)", () => {
    expect(containerLabel("ration", { kind: null, label: null })).toBe("pack");
  });
});

describe("pluralize", () => {
  it("returns the singular when n === 1", () => {
    expect(pluralize(1, "bottle")).toBe("bottle");
  });

  it("appends -s when n !== 1", () => {
    expect(pluralize(2, "bottle")).toBe("bottles");
  });

  it("adds -es for sibilant endings (0 box ⇒ boxes)", () => {
    expect(pluralize(0, "box")).toBe("boxes");
    expect(pluralize(2, "box")).toBe("boxes");
  });

  it("pluralizes decimals (1.5 bottles)", () => {
    expect(pluralize(1.5, "bottle")).toBe("bottles");
  });
});

describe("costPerServing", () => {
  it("divides rate by units_per_pack (750 ml lot, ₹200, 25 pegs ⇒ ₹8/peg)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(costPerServing(200, upp)).toBe(8);
  });

  it("returns the full rate when units_per_pack is null (indivisible)", () => {
    expect(costPerServing(200, null)).toBe(200);
  });

  it("returns the full rate when units_per_pack is 0 (no divide-by-zero)", () => {
    expect(costPerServing(200, 0)).toBe(200);
  });

  it("returns the full rate when units_per_pack is negative", () => {
    expect(costPerServing(200, -5)).toBe(200);
  });

  it("second lot at a different rate (₹250, 25 pegs ⇒ ₹10/peg)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(costPerServing(250, upp)).toBe(10);
  });
});

describe("servingsOnHand", () => {
  it("multiplies qty_packs by units_per_pack", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(servingsOnHand(2, upp)).toBe(50);
  });

  it("treats null units_per_pack as 1 (whole packs ⇒ qty itself)", () => {
    expect(servingsOnHand(3, null)).toBe(3);
  });

  it("supports decimal pack quantities (half bottle ⇒ 12.5 pegs)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(servingsOnHand(0.5, upp)).toBe(12.5);
  });
});

describe("lotValue", () => {
  it("multiplies qty_packs by rate", () => {
    expect(lotValue(2, 200)).toBe(400);
  });

  it("supports decimal pack quantities (0.5 pack @ ₹200 ⇒ ₹100)", () => {
    expect(lotValue(0.5, 200)).toBe(100);
  });

  it("decimal rate (1.5 packs @ ₹250.5 ⇒ ₹375.75)", () => {
    expect(lotValue(1.5, 250.5)).toBeCloseTo(375.75, 2);
  });
});

describe("consumeCost", () => {
  it("a whole pack consumed costs its full rate (25 pegs @ ₹200/750 ml ⇒ ₹200)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(consumeCost(25, 200, upp)).toBe(200);
  });

  it("a single serving costs cost-per-serving (1 peg from ₹200/750 ml ⇒ ₹8)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(consumeCost(1, 200, upp)).toBe(8);
  });

  it("uses the second lot's rate when costing from it (25 pegs @ ₹250 ⇒ ₹250)", () => {
    const upp = derivedUnitsPerPack("alcohol", {
      kind: "volume",
      volume_ml: 750,
      unit_count: null,
    });
    expect(consumeCost(25, 250, upp)).toBe(250);
  });

  it("with null units_per_pack each serving costs the full rate", () => {
    expect(consumeCost(3, 200, null)).toBe(600);
  });
});
