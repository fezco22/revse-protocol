"use client";

import Link from "next/link";
import { useApp } from "@/state/app";
import {
  TERM_DAYS,
  usd,
  usdCompact,
  utilPercent,
  termInterest,
  fmtDate,
  parseAmount,
  ratePct,
} from "@/lib/format";
import { TERM_SECONDS } from "@/lib/demo";
import { Section, LedgerRow, StewardStrip, TickValue } from "@/components/ui";
import { IconLock, IconBorrow, IconArrow } from "@/components/icons";
import { useState } from "react";

export default function MarketPage() {
  const { pool, positions, live } = useApp();
  const [amount, setAmount] = useState(1000);

  const rate = pool?.apyRate ?? 0;
  const util = pool?.utilization ?? 0;
  const apyPct = ratePct(rate);
  const interest = termInterest(
    amount * 10_000_000,
    rate,
    TERM_SECONDS
  );
  const maturity = pool
    ? Math.floor(pool.updatedAt / 1000) + TERM_SECONDS
    : 0;

  const openDeposits = positions.filter((p) => p.side === "deposit").length;
  const hasBorrow = positions.some((p) => p.side === "borrow");

  return (
    <div className="flex flex-col gap-6">
      {/* Certificate — the instrument itself */}
      <article className="border border-hairline bg-surface shadow-paper">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
              FixYield Certificate
            </p>
            <p className="num mt-0.5 text-[11px] text-ink-faint">
              TERM {TERM_DAYS} DAYS · FIXED NOT FLOATING
            </p>
          </div>
          <span className="num flex items-center gap-1.5 border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-dim">
            <span
              className="h-1.5 w-1.5 rounded-full bg-signal pulse-dot"
            />
            {live ? "Live" : "Demo"} market
          </span>
        </div>

        <div className="px-5 pb-5 pt-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-ink-muted">Current fixed APY</p>
              <p className="num mt-2 text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                <TickValue value={rate}>{apyPct.toFixed(2)}</TickValue>
                <span className="text-2xl text-signal">%</span>
              </p>
              <p className="num mt-2 text-xs text-ink-muted">
                locked at open · matures{" "}
                <span className="text-ink-dim">
                {maturity ? fmtDate(maturity) : "—"}
              </span>
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[11px] uppercase tracking-[0.14em] text-ink-muted">
                Utilization
              </p>
              <p className="num mt-1 text-2xl font-semibold text-ink">
                {pool ? utilPercent(util) : "—"}
              </p>
            </div>
          </div>

          {/* paired legs — the delta hedge made visible */}
          <UtilGauge util={pool?.utilization ?? 0} />

          <div className="mt-4 grid grid-cols-2 gap-px bg-hairline">
            <div className="bg-surface p-4">
              <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                Fixed leg
              </p>
              <p className="num mt-1 text-lg font-semibold text-signal">
                {pool ? usdCompact(pool.fixedUnits) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                your locked claims
              </p>
            </div>
            <div className="bg-surface p-4">
              <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                Variable leg
              </p>
              <p className="num mt-1 text-lg font-semibold text-ink">
                {pool ? usdCompact(pool.variableUnits) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                the floating hedge
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline px-5 py-4">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            The fixed rate you lock is held, not promised: a delta-hedged
            VAMM matches your fixed claim against the pool&apos;s floating
            yield so that market moves cannot touch your number.
          </p>
        </div>
      </article>

      {/* Table preview of a 30-day deposit */}
      <Section
        title="Example · 30-day deposit"
        meta={<span className="num">{usd(amount * 10_000_000, 0)}</span>}
      >
        <div className="mb-4 flex flex-col gap-2">
          <label
            htmlFor="mv-amount"
            className="text-[11px] uppercase tracking-[0.14em] text-ink-muted"
          >
            Principal
          </label>
          <div className="flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
            <span className="pl-4 text-sm text-ink-faint">$</span>
            <input
              id="mv-amount"
              inputMode="decimal"
              value={amount}
              min={10}
              onChange={(e) =>
                setAmount(Math.max(10, parseAmount(e.target.value) || 10))
              }
              className="num w-full bg-transparent px-3 py-3 text-lg text-ink caret-signal focus:outline-none"
            />
            <span className="num pr-4 text-[11px] uppercase tracking-wide text-ink-faint">
              USDC
            </span>
          </div>
        </div>

        <LedgerRow
          label={`Locked APY (${TERM_DAYS}d)`}
          value={<span className="text-signal">{apyPct.toFixed(2)}%</span>}
        />
        <LedgerRow label="Principal" value={usd(amount * 10_000_000)} />
        <LedgerRow label="Interest at maturity" value={usd(Math.round(interest))} />
        <LedgerRow
          label="Return at maturity"
          value={usd(amount * 10_000_000 + Math.round(interest))}
          tone="signal"
        />
        <LedgerRow
          label="Maturity"
          value={maturity ? fmtDate(maturity) : "—"}
          tone="dim"
        />
        <div className="mt-5 flex gap-3">
          <Link
            href="/deposit"
            className="flex flex-1 items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e]"
          >
            <IconLock width={15} height={15} />
            Lock this rate
            <IconArrow />
          </Link>
        </div>
      </Section>

      {/* borrow strip */}
      <StewardStrip>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center border border-signal-dim/50 text-signal">
              <IconBorrow width={16} height={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">
                Borrow fixed, repay the same you borrowed
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Collateralise USDC, borrow at a fixed rate, repay principal only.
              </p>
            </div>
          </div>
          {hasBorrow ? (
            <Link
              href="/positions"
              className="num shrink-0 border border-hairline px-3 py-2 text-xs font-medium text-ink hover:border-ink-muted hover:text-signal"
            >
              Manage
            </Link>
          ) : (
            <Link
              href="/borrow"
              className="num shrink-0 border border-hairline px-3 py-2 text-xs font-medium text-ink hover:border-ink-muted hover:text-signal"
            >
              Borrow →
            </Link>
          )}
        </div>
      </StewardStrip>

      {openDeposits > 0 && (
        <p className="num text-center text-[11px] text-ink-faint">
          {openDeposits} open{' '}
          {openDeposits === 1 ? "deposit" : "deposits"} in your portfolio →
          <Link href="/positions" className="text-ink-dim underline underline-offset-4 hover:text-signal">
            {" "}view
          </Link>
        </p>
      )}
    </div>
  );
}

function UtilGauge({ util }: { util: number }) {
  const pct = (util / 1e9) * 100;
  return (
    <div className="mt-6">
      <div className="relative h-1.5 w-full bg-carbon">
        <div
          className="absolute inset-y-0 left-0 bg-signal transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        <div className="absolute inset-y-0 right-0 w-px bg-signal/40" />
      </div>
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        <span className="text-signal">locked</span>
        <span>hedge</span>
      </div>
    </div>
  );
}