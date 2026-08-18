"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/state/app";
import {
  TERM_DAYS,
  TERM_SECONDS,
  usd,
  usdCompact,
  utilPercent,
  fmtDate,
  parseAmount,
  ratePct,
} from "@/lib/format";
import { Section, LedgerRow, StewardStrip, TickValue, Spinner } from "@/components/ui";
import { FaucetButton } from "@/components/FaucetButton";
import {
  IconLock,
  IconBorrow,
  IconArrow,
  IconCheck,
  IconAlert,
} from "@/components/icons";

export default function MarketPage() {
  const { pool, positions, balance, quoteFor, mutateDeposit, mutStage, mutError } =
    useApp();
  const router = useRouter();

  const [amount, setAmount] = useState(1000);
  const [lastDone, setLastDone] = useState<number | null>(null);

  const rate = pool?.apyRate ?? 0;
  const util = pool?.utilization ?? 0;
  const marketApy = ratePct(rate);

  const amtUnits = useMemo(() => Math.round(amount * 10_000_000), [amount]);
  const quote = useMemo(() => quoteFor(amtUnits), [amtUnits, quoteFor]);
  const apyPct = ratePct(quote.apyRate);
  const insufficient = amtUnits > balance;

  const maturity = pool ? Math.floor(pool.updatedAt / 1000) + TERM_SECONDS : 0;
  const openDeposits = positions.filter((p) => p.side === "deposit").length;
  const hasBorrow = positions.some((p) => p.side === "borrow");

  const busy =
    mutStage === "awaiting-sign" ||
    mutStage === "signing" ||
    mutStage === "confirming";

  const submit = async () => {
    if (busy) return;
    const pos = await mutateDeposit(amtUnits);
    setLastDone(pos.id);
  };

  // After a successful mint, hand over to the dashboard.
  useEffect(() => {
    if (lastDone !== null) {
      const t = setTimeout(() => router.push("/positions"), 1400);
      return () => clearTimeout(t);
    }
  }, [lastDone, router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* ============ LEFT: the instrument / market state ============ */}
        <article className="border border-hairline bg-surface shadow-paper">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                Revse Certificate
              </p>
              <p className="num mt-0.5 text-[11px] text-ink-faint">
                TERM {TERM_DAYS} DAYS · FIXED NOT FLOATING
              </p>
            </div>
            <span className="num flex items-center gap-1.5 border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              USDC market
            </span>
          </div>

          <div className="px-5 pb-5 pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-ink-muted">Current fixed APY</p>
                <p className="num mt-2 text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                  <TickValue value={rate}>{marketApy.toFixed(2)}</TickValue>
                  <span className="text-2xl text-signal">%</span>
                </p>
                <p className="num mt-2 text-xs text-ink-muted">
                  locked at open · matures{" "}
                  <span className="text-ink-dim">
                    {maturity ? fmtDate(maturity) : "·"}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="num text-[11px] uppercase tracking-[0.14em] text-ink-muted">
                  Utilization
                </p>
                <p className="num mt-1 text-2xl font-semibold text-ink">
                  {pool ? utilPercent(util) : "·"}
                </p>
              </div>
            </div>

            <UtilGauge util={pool?.utilization ?? 0} />

            <div className="mt-4 grid grid-cols-2 gap-px bg-hairline">
              <div className="bg-surface p-4">
                <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  Fixed leg
                </p>
                <p className="num mt-1 text-lg font-semibold text-signal">
                  {pool ? usdCompact(pool.fixedUnits) : "·"}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  locked claims
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  Variable leg
                </p>
                <p className="num mt-1 text-lg font-semibold text-ink">
                  {pool ? usdCompact(pool.variableUnits) : "·"}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  the floating hedge
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-hairline px-5 py-4">
            <p className="text-[11px] leading-relaxed text-ink-muted">
              The fixed rate you lock is held, not promised: a delta-hedged VAMM
              matches your fixed claim against the pool&apos;s floating yield so
              that market moves cannot touch your number.
            </p>
          </div>
        </article>

        {/* ============ RIGHT: deposit form (mint) ============ */}
        <div className="flex flex-col gap-6">
          <Section title="Lock a rate" meta={<span className="num">{TERM_DAYS}d</span>}>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="dep-amount"
                className="text-[11px] uppercase tracking-[0.14em] text-ink-muted"
              >
                Principal (USDC)
              </label>
              <div className="flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
                <span className="pl-4 text-sm text-ink-faint">$</span>
                <input
                  id="dep-amount"
                  inputMode="decimal"
                  value={amount}
                  min={10}
                  onChange={(e) =>
                    setAmount(Math.max(0, parseAmount(e.target.value)))
                  }
                  className="num w-full bg-transparent px-3 py-3.5 text-2xl text-ink caret-signal focus:outline-none"
                />
                <button
                  onClick={() => setAmount(Number(balance) / 10_000_000)}
                  className="num mr-3 border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted hover:border-ink-muted hover:text-signal"
                >
                  Max
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="num text-[11px] text-ink-faint">
                  Available {usd(balance)} · min $10
                </p>
                <FaucetButton label="Get USDC" />
              </div>
            </div>

            {insufficient && (
              <p
                role="alert"
                className="mt-3 flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk"
              >
                <IconAlert width={14} height={14} />
                You have {usd(balance)} available. Lower the amount to continue.
              </p>
            )}

            {mutError && (
              <p
                role="alert"
                className="mt-3 flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk"
              >
                <IconAlert width={14} height={14} />
                {mutError}
              </p>
            )}

            <div className="mt-5">
              <LedgerRow
                label="Fixed APY · locked at open"
                value={<span className="text-signal">{apyPct.toFixed(2)}%</span>}
              />
              <LedgerRow label="Principal" value={usd(amtUnits)} />
              <LedgerRow
                label="Interest at maturity"
                value={usd(quote.interestUnits)}
              />
              <LedgerRow
                label="Guaranteed return"
                value={usd(amtUnits + quote.interestUnits)}
                tone="signal"
              />
              <LedgerRow
                label="Matures"
                value={fmtDate(quote.maturityTs)}
                tone="dim"
              />
            </div>
          </Section>

          <button
            onClick={() => void submit()}
            disabled={busy || amount < 10 || insufficient}
            className="flex min-h-[52px] items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner size={16} />
                {mutStage === "awaiting-sign" && "Awaiting your approval…"}
                {mutStage === "signing" && "Signing transaction…"}
                {mutStage === "confirming" && "Confirming on-chain…"}
              </>
            ) : mutStage === "error" ? (
              <>
                <IconAlert width={15} height={15} />
                Retry deposit
              </>
            ) : (
              <>
                <IconLock width={15} height={15} />
                Mint certificate
                <IconArrow />
              </>
            )}
          </button>

          {mutStage === "done" && lastDone !== null && (
            <div className="stamp border border-signal/50 bg-signal/10 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-signal">
                <IconCheck width={15} height={15} />
                Certificate #{lastDone} minted. Rate locked.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Taking you to your dashboard…
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ============ borrow strip ============ */}
      <StewardStrip>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center border border-signal-dim/50 text-signal">
              <IconBorrow width={16} height={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">
                Borrow fixed, repay only what you borrowed
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Collateralise USDC, borrow at a fixed rate, repay principal only.
              </p>
            </div>
          </div>
          <Link
            href={hasBorrow ? "/positions" : "/borrow"}
            className="num shrink-0 border border-hairline px-3 py-2 text-xs font-medium text-ink hover:border-ink-muted hover:text-signal"
          >
            {hasBorrow ? "Manage" : "Borrow →"}
          </Link>
        </div>
      </StewardStrip>

      {openDeposits > 0 && (
        <p className="num text-center text-[11px] text-ink-faint">
          {openDeposits} open {openDeposits === 1 ? "deposit" : "deposits"} in
          your portfolio →{" "}
          <Link
            href="/positions"
            className="text-ink-dim underline underline-offset-4 hover:text-signal"
          >
            view
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
