import type { FxEvent, PoolState, Position, Quote } from "./types";
import { RATE_SCALE, YEAR_SECONDS, TERM_DAYS } from "./format";

export const TERM_SECONDS = TERM_DAYS * 86_400;

/**
 * Demo mode data source.
 *
 * Behaves like the real contracts so the demo is honest:
 *  - `state()` mirrors RateVAMM::state (apy clamped base rate, utilization,
 *    both virtual legs).
 *  - `deposit_fixed` shifts the virtual reserves along the constant-product
 *    curve and emits a depositfx event, exactly as PositionSettlement does.
 *  - The demo variable rate wanders every few seconds and the pool re-quotes,
 *    which is what Soroban RPC getEvents would deliver in live mode.
 */
export interface DemoEvent {
  name: string;
  ts: number;
  ledger: number;
}

export class DemoSource {
  private now = Math.floor(Date.now() / 1000);

  private cfg = {
    idleRate: 0.045 * RATE_SCALE,
    slope: 0.09 * RATE_SCALE,
    minRate: 0.01 * RATE_SCALE,
    maxRate: 0.15 * RATE_SCALE,
  };

  private xFixed = 4_200_000n * 10_000_000n; // 4.2M USDC fixed leg
  private yVariable = 2_800_000n * 10_000_000n; // 2.8M USDC variable leg
  private k = this.xFixed * this.yVariable;

  private positions: Position[] = [];
  private nextId = 1;

  private wanderBps = 0;
  private listeners = new Set<(e: DemoEvent) => void>();

  constructor() {
    this.seed();
    setInterval(() => this.wander(), 4500);
  }

  private seed() {
    const t = this.now;
    const mk = (
      id: number,
      side: Position["side"],
      amount: number,
      apy: number,
      openDaysAgo: number,
      collateral = 0
    ): Position => ({
      id,
      user: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      side,
      amount,
      apy,
      openTs: t - openDaysAgo * 86_400,
      maturityTs: t - openDaysAgo * 86_400 + TERM_SECONDS,
      collateral,
      claimed: false,
      liquidated: false,
    });
    this.positions = [
      mk(1, "deposit", 2_500_000_000_000, 0.0525 * RATE_SCALE, 21),
      mk(2, "deposit", 12_000_000_000_000, 0.0499 * RATE_SCALE, 8),
      mk(3, "borrow", 4_000_000_000_000, 0.0612 * RATE_SCALE, 14, 5_200_000_000_000),
    ];
    this.nextId = 4;
  }

  private wander() {
    // ±7 bps wander in RATE_SCALE units (7 bps = 0.0007 = 700_000)
    this.wanderBps = Math.round((Math.random() - 0.5) * 14 * 100_000);
    this.emit("var_sync");
  }

  subscribe(fn: (e: DemoEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(name: string, ledger = 0) {
    const e = { name, ts: this.now, ledger };
    for (const fn of this.listeners) fn(e);
  }

  private utilization(): number {
    const total = this.xFixed + this.yVariable;
    const fixedFraction =
      Number(total) === 0 ? 0 : Number(this.xFixed) / Number(total);
    // utilization = share of pool locked to fixed liabilities, dimmed by the
    // variable leg — matches the contract's utilization() shape.
    return Math.round((1 - fixedFraction) * RATE_SCALE * 10) / 10;
  }

  private baseRate(): number {
    const u = this.utilization() / RATE_SCALE;
    const raw = this.cfg.idleRate + u * this.cfg.slope;
    return Math.min(this.cfg.maxRate, Math.max(this.cfg.minRate, raw));
  }

  state(): PoolState {
    const apy = this.baseRate() + this.wanderBps;
    return {
      apyRate: apy,
      utilization: this.utilization(),
      tvlUnits: Number(this.xFixed + this.yVariable),
      fixedUnits: Number(this.xFixed),
      variableUnits: Number(this.yVariable),
      updatedAt: Date.now(),
    };
  }

  quote(amountUnits: number): Quote {
    const amount = BigInt(Math.round(amountUnits));
    if (amount <= 0n) throw new Error("amount must be positive");
    // constant-product marginal rate: base * (x / (x + amount))
    const nextX = this.xFixed + amount;
    const mr = (this.baseRate() * Number(nextX)) / Number(this.xFixed);
    const apy = Math.min(
      this.cfg.maxRate,
      Math.max(this.cfg.minRate, mr + this.wanderBps)
    );
    const maturityTs = this.now + TERM_SECONDS;
    const interest =
      (Number(amount) * apy * TERM_SECONDS) / (RATE_SCALE * YEAR_SECONDS);
    return {
      apyRate: Math.round(apy),
      utilization: this.utilization(),
      interestUnits: Math.round(interest),
      maturityTs,
    };
  }

  positionsOf(user: string): Position[] {
    return this.positions
      .filter((p) => p.user === user && !p.claimed && !p.liquidated)
      .map((p) => ({ ...p }));
  }

  simulateDeposit(amountUnits: number): Position {
    const amount = BigInt(Math.round(amountUnits));
    if (amount <= 0n) throw new Error("amount must be positive");
    const quote = this.quote(amountUnits);
    const pos: Position = {
      id: this.nextId++,
      user: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      side: "deposit",
      amount: Number(amount),
      apy: quote.apyRate,
      openTs: this.now,
      maturityTs: quote.maturityTs,
      collateral: 0,
      claimed: false,
      liquidated: false,
    };
    this.positions.push(pos);
    this.xFixed += amount;
    this.yVariable = this.k / this.xFixed;
    this.emit("depositfx", pos.id);
    return pos;
  }

  simulateClaim(positionId: number) {
    const p = this.positions.find((x) => x.id === positionId);
    if (!p || p.side !== "deposit") throw new Error("not a deposit");
    if (p.claimed) throw new Error("already claimed");
    p.claimed = true;
    this.emit("matclaim", p.id);
  }

  simulateRepay(positionId: number) {
    const p = this.positions.find((x) => x.id === positionId);
    if (!p || p.side !== "borrow") throw new Error("not a borrow");
    if (p.claimed) throw new Error("already repaid");
    p.claimed = true;
    this.emit("repay", p.id);
  }

  private fmtEvent(e: FxEvent): string {
    return `${e.name}@${e.ledger}`;
  }
}

export function isReady(ts: number): boolean {
  return ts <= Math.floor(Date.now() / 1000);
}

declare global {
  var __demo: DemoSource | undefined;
}
export function demo(): DemoSource {
  if (!globalThis.__demo) {
    globalThis.__demo = new DemoSource();
  }
  return globalThis.__demo;
}