import { describe, expect, it } from "vitest";
import {
  RATE_SCALE,
  TERM_DAYS,
  bpsPercent,
  fmtCountdown,
  parseAmount,
  ratePct,
  ratePercent,
  rateToBps,
  termInterest,
  usd,
  usdCompact,
  utilPercent,
} from "./format";

describe("usd", () => {
  it("scales micro-units to dollars (1e7)", () => {
    expect(usd(1_000_000_000_000)).toBe("$100,000.00");
  });

  it("accepts bigint micro-units with the same result as number", () => {
    expect(usd(1_250_000_000n)).toBe(usd(1_250_000_000));
  });

  it("round-trips zero", () => {
    expect(usd(0)).toBe("$0.00");
  });

  it("renders sub-cent amounts without collapsing to zero-dollar", () => {
    expect(usd(1)).toBe("$0.00");
  });
});

describe("usdCompact", () => {
  it("renders thousands with K", () => {
    expect(usdCompact(10_000_000_000)).toBe("$1.00K");
  });

  it("renders millions with M", () => {
    expect(usdCompact(42_000_000_000_000)).toBe("$4.20M");
  });

  it("renders billions with B", () => {
    expect(usdCompact(7_000_000_000_000_000)).toBe("$700M");
  });
});

describe("rate helpers", () => {
  const fivePct = 0.05 * RATE_SCALE;

  it("rateToBps converts rate scale to basis points", () => {
    expect(rateToBps(fivePct)).toBe(500);
  });

  it("ratePct converts rate scale to a percent number", () => {
    expect(ratePct(fivePct)).toBe(5);
  });

  it("ratePercent renders a human APY string", () => {
    expect(ratePercent(fivePct)).toBe("5.00%");
  });

  it("bpsPercent renders bps", () => {
    expect(bpsPercent(525)).toBe("5.25%");
  });

  it("utilPercent converts utilization scale to a percent", () => {
    expect(utilPercent(0.4 * RATE_SCALE)).toBe("40.0%");
  });
});

describe("termInterest", () => {
  it("computes fixed-term interest on $1,000 at 8% for 30 days", () => {
    const apy = 0.08 * RATE_SCALE;
    const interest = termInterest(10_000_000_000, apy, TERM_DAYS * 86_400);
    // 1e10 units * 0.08 * (30/365) = $6.57 → 65,708,419 micro-units
    expect(interest).toBeCloseTo(65_708_419, -2);
  });

  it("is zero for a zero principal", () => {
    expect(termInterest(0, 0.08 * RATE_SCALE, TERM_DAYS * 86_400)).toBe(0);
  });
});

describe("fmtCountdown", () => {
  it("shows d/hh:mm for terms longer than a day", () => {
    expect(fmtCountdown(1_000, 1_000 + 21 * 86_400 + 3 * 3600 + 120)).toBe(
      "21d 03:02"
    );
  });

  it("shows hh:mm:ss for sub-day terms", () => {
    expect(fmtCountdown(1_000, 1_000 + 3 * 3600 + 61)).toBe("03:01:01");
  });

  it("clamps to zero at or after maturity", () => {
    expect(fmtCountdown(1_000, 1_000)).toBe("00:00:00");
    expect(fmtCountdown(2_000, 1_000)).toBe("00:00:00");
  });
});

describe("parseAmount", () => {
  it("strips non-numeric characters", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56);
  });

  it("caps at two decimals", () => {
    expect(parseAmount("12.345")).toBe(12.34);
  });

  it("handles bare integers and empty input", () => {
    expect(parseAmount("5000")).toBe(5000);
    expect(parseAmount("")).toBe(0);
  });
});
