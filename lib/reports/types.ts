// Client-safe shapes for unit reports (REQ-RPT-01). queries.ts is `server-only`;
// importing a type from it still pulls the module into the client bundle, so
// shared shapes live here with no server-only marker / runtime deps.

/** One day on the messing P-rate trend. Dates are ISO `yyyy-MM-dd`. */
export type PRatePoint = {
  date: string;
  rate: number;
};

/**
 * Unit-scoped KPI snapshot for `reports.unit`:
 * P-rate trend, bar sales, ration net, guest-room revenue, outstanding dues.
 */
export type UnitReportSnapshot = {
  periodStart: string;
  periodEnd: string;
  pRates: PRatePoint[];
  barSalesTotal: number;
  /** Net ration quantity across the period (issued − returned, all variants). */
  rationNetQty: number;
  /** Rupee equivalent of ration net (qty × last receipt rate, all variants). */
  rationNetAmount: number;
  guestRoomRevenue: number;
  outstandingDues: number;
  outstandingCount: number;
};
