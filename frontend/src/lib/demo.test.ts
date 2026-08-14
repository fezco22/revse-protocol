import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoSource } from "./demo";
import { RATE_SCALE } from "./format";
import { DEMO_USER_ADDR } from "./types";

afterEach(() => {
  vi.useRealTimers();
});

describe("DemoSource state", () => {
  it("exposes a utilization between 0 and RATE_SCALE", () => {
    const src = new DemoSource();
    const s = src.state();
    expect(s.utilization).toBeGreaterThanOrEqual(0);
    expect(s.utilization).toBeLessThanOrEqual(RATE_SCALE);
  });

  it("quotes an APY clamped to the [minRate, maxRate] band", () => {
    const src = new DemoSource();
    for (let i = 0; i < 50; i++) {
      const q = src.quote(100_000_000 + i * 100_000_000);
      expect(q.apyRate).toBeGreaterThanOrEqual(0.01 * RATE_SCALE);
      expect(q.apyRate).toBeLessThanOrEqual(0.15 * RATE_SCALE);
    }
  });

  it("returns only the seeded demo user's open positions", () => {
    const src = new DemoSource();
    const pos = src.positionsOf(DEMO_USER_ADDR);
    expect(pos).toHaveLength(3);
    expect(pos.every((p) => !p.claimed && !p.liquidated)).toBe(true);
  });

  it("returns no positions for an unknown user", () => {
    const src = new DemoSource();
    expect(src.positionsOf("GBLAH")).toHaveLength(0);
  });
});

describe("DemoSource simulateDeposit", () => {
  it("mints a deposit position and grows the fixed leg", () => {
    const src = new DemoSource();
    const before = src.state().fixedUnits;
    const pos = src.simulateDeposit(1_000_000_000_000);
    expect(pos.side).toBe("deposit");
    expect(pos.amount).toBe(1_000_000_000_000);
    expect(pos.maturityTs).toBeGreaterThan(pos.openTs);
    const after = src.state().fixedUnits;
    expect(after).toBeGreaterThan(before);
  });

  it("rejects zero or negative amounts", () => {
    const src = new DemoSource();
    expect(() => src.simulateDeposit(0)).toThrow("positive");
    expect(() => src.simulateDeposit(-5)).toThrow("positive");
  });

  it("emits a depositfx event to subscribers", () => {
    const src = new DemoSource();
    const seen: string[] = [];
    const unsub = src.subscribe((e) => seen.push(e.name));
    src.simulateDeposit(1_000_000_000_000);
    expect(seen).toContain("depositfx");
    unsub();
  });
});

describe("DemoSource claim/repay", () => {
  it("claim marks the deposit claimed and hides it from positionsOf", () => {
    const src = new DemoSource();
    const pos = src.simulateDeposit(1_000_000_000_000);
    src.simulateClaim(pos.id);
    expect(src.positionsOf(DEMO_USER_ADDR).some((p) => p.id === pos.id)).toBe(
      false
    );
  });

  it("repay marks the borrow repaid and hides it from positionsOf", () => {
    const src = new DemoSource();
    const borrow = src.positionsOf(DEMO_USER_ADDR).find((p) => p.side === "borrow");
    if (!borrow) throw new Error("expected a seeded borrow");
    src.simulateRepay(borrow.id);
    expect(src.positionsOf(DEMO_USER_ADDR).some((p) => p.id === borrow.id)).toBe(
      false
    );
  });

  it("rejects claiming a non-deposit", () => {
    const src = new DemoSource();
    const borrow = src.positionsOf(DEMO_USER_ADDR).find((p) => p.side === "borrow");
    if (!borrow) throw new Error("expected a seeded borrow");
    expect(() => src.simulateClaim(borrow.id)).toThrow("not a deposit");
  });
});