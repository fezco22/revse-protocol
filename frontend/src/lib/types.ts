export type Side = "deposit" | "borrow";
export type PositionStatus = "open" | "ready" | "claimed" | "liquidated";

export interface Position {
  id: number;
  user: string;
  side: Side;
  /** principal in USDC micro-units (1e7) */
  amount: number;
  /** fixed apy at open, RATE_SCALE (1e9) */
  apy: number;
  openTs: number;
  maturityTs: number;
  /** collateral in micro-units (borrow side) */
  collateral: number;
  claimed: boolean;
  liquidated: boolean;
}

export interface PoolState {
  /** currently quoted effective fixed apy, RATE_SCALE */
  apyRate: number;
  /** utilization, RATE_SCALE */
  utilization: number;
  /** total protocol reserves (fixed + variable legs), micro-units */
  tvlUnits: number;
  /** virtual fixed-leg reserve, micro-units */
  fixedUnits: number;
  /** variable-leg reserve, micro-units */
  variableUnits: number;
  updatedAt: number;
}

export type FxEventName =
  | "depositfx"
  | "borrowfx"
  | "matclaim"
  | "repay"
  | "liquidate";

export interface FxEvent {
  name: FxEventName;
  ledger: number;
  raw: unknown[];
}

export type MutStage =
  | "idle"
  | "quoting"
  | "simulating"
  | "awaiting-sign"
  | "signing"
  | "confirming"
  | "done"
  | "error";

export interface Quote {
  apyRate: number;
  utilization: number;
  interestUnits: number;
  maturityTs: number;
}

export const DEMO_USER_ADDR =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export const ENV = {
  live: Boolean(
    process.env.NEXT_PUBLIC_VAMM_CONTRACT &&
      process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT
  ),
};