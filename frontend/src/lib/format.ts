// ---- Revse mobile-first formatting & math helpers ----

export const RATE_SCALE = 1_000_000_000;
export const YEAR_SECONDS = 31_557_600;
export const DAY_SECONDS = 86_400;
export const TERM_DAYS = 30;
export const TERM_SECONDS = TERM_DAYS * DAY_SECONDS;

/** A position is claimable once its maturity timestamp (seconds) has passed. */
export function isReady(maturityTs: number): boolean {
  return maturityTs <= Math.floor(Date.now() / 1000);
}

/** rate (RATE_SCALE) -> bp points (e.g. 5.25% -> 525) */
export function rateToBps(rate: number): number {
  return (rate / RATE_SCALE) * 10_000;
}

/** bps -> human APY string like "5.24%" */
export function bpsPercent(bps: number, digits = 2): string {
  return `${(bps / 100).toFixed(digits)}%`;
}

/** rate (RATE_SCALE) -> human APY string */
export function ratePercent(rate: number, digits = 2): string {
  return bpsPercent(rateToBps(rate), digits);
}

/** rate (RATE_SCALE) -> percent number, e.g. 0.0525*scale -> 5.25 */
export function ratePct(rate: number): number {
  return (rate / RATE_SCALE) * 100;
}

/** i128 micro-units -> "$1,234.56" (accepts bigint or number micro-units) */
export function usd(units: bigint | number, digits = 2): string {
  const n = Number(units) / 1e7;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** i128 micro-units -> compact "$1.23M" / "$45.6K" */
export function usdCompact(units: bigint | number): string {
  const n = Number(units) / 1e7;
  const abs = Math.abs(n);
  const fmt = (v: number, suffix: string) =>
    `$${v.toLocaleString("en-US", {
      minimumFractionDigits: v >= 100 ? 0 : 2,
      maximumFractionDigits: v >= 100 ? 0 : 2,
    })}${suffix}`;
  if (abs >= 1e9) return fmt(n / 1e9, "B");
  if (abs >= 1e6) return fmt(n / 1e6, "M");
  if (abs >= 1e3) return fmt(n / 1e3, "K");
  return fmt(n, "");
}

/** utilization (RATE_SCALE) -> "64.2%" */
export function utilPercent(util: number, digits = 1): string {
  return `${((util / RATE_SCALE) * 100).toFixed(digits)}%`;
}

/** interest on a fixed deposit: principal * apy * term / (scale*year) */
export function termInterest(principalUsd: number, apyRate: number, termSeconds: number): number {
  return (principalUsd * apyRate * termSeconds) / (RATE_SCALE * YEAR_SECONDS);
}

export function fmtClock(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "9d 04:12:33" countdown */
export function fmtCountdown(nowTs: number, targetTs: number): string {
  const diff = Math.max(0, targetTs - nowTs);
  const d = Math.floor(diff / DAY_SECONDS);
  const h = Math.floor((diff % DAY_SECONDS) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  return d > 0
    ? `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function shortAddr(addr: string, head = 5, tail = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Money input formatting: strip to 2dp, keep as plain "1234.56" */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const m = cleaned.match(/^(\d+)(?:\.(\d{0,2}))?/);
  if (!m) return 0;
  return Number(`${m[1]}.${m[2] ?? ""}` || "0");
}