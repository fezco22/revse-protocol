"use client";

import { useState } from "react";
import { useApp } from "@/state/app";
import { usd, parseAmount, ratePct } from "@/lib/format";
import { Section, LedgerRow } from "@/components/ui";
import { IconBorrow, IconAlert } from "@/components/icons";

export default function BorrowPage() {
  const { pool, balance } = useApp();
  const [amount, setAmount] = useState(500);
  const [collateral, setCollateral] = useState(750);

  const amtUnits = amount * 10_000_000;
  const colUnits = collateral * 10_000_000;
  const ratio = amount > 0 ? (colUnits / amtUnits) * 100 : 0;
  const apyPct = pool ? ratePct(pool.apyRate) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Borrow fixed
        </h1>
        <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          Post USDC collateral and borrow at a fixed rate. You repay exactly
          the principal at maturity — the interest is already priced into the
          fixed rate you lock.
        </p>
      </header>

      <Section title="Loan request">
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="br-c"
              className="text-[11px] uppercase tracking-[0.14em] text-ink-muted"
            >
              Collateral (USDC)
            </label>
            <div className="mt-2 flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
              <span className="pl-4 text-sm text-ink-faint">$</span>
              <input
                id="br-c"
                inputMode="decimal"
                value={collateral}
                min={0}
                onChange={(e) =>
                  setCollateral(Math.max(0, parseAmount(e.target.value)))
                }
                className="num w-full bg-transparent px-3 py-3 text-lg text-ink caret-signal focus:outline-none"
              />
            </div>
            <p className="num mt-1 text-[11px] text-ink-faint">
              Available {usd(balance)}
            </p>
          </div>

          <div>
            <label
              htmlFor="br-a"
              className="text-[11px] uppercase tracking-[0.14em] text-ink-muted"
            >
              Borrow amount
            </label>
            <div className="mt-2 flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
              <span className="pl-4 text-sm text-ink-faint">$</span>
              <input
                id="br-a"
                inputMode="decimal"
                value={amount}
                min={0}
                onChange={(e) =>
                  setAmount(Math.max(0, parseAmount(e.target.value)))
                }
                className="num w-full bg-transparent px-3 py-3 text-lg text-ink caret-signal focus:outline-none"
              />
            </div>
          </div>

          {ratio > 0 && ratio < 150 && (
            <p className="flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk">
              <IconAlert width={14} height={14} />
              Collateral ratio {ratio.toFixed(1)}% — below the 150% minimum.
            </p>
          )}
        </div>
      </Section>

      <Section title="Fixed loan terms">
        <LedgerRow
          label="Fixed borrow APY"
          value={<span className="text-signal">{apyPct.toFixed(2)}%</span>}
        />
        <LedgerRow label="Borrow principal" value={usd(amtUnits)} />
        <LedgerRow label="Collateral posted" value={usd(colUnits)} />
        <LedgerRow
          label="Collateral ratio"
          value={`${ratio.toFixed(1)}%`}
          tone={ratio >= 150 ? "signal" : "risk"}
        />
        <LedgerRow
          label="Term"
          value="30 days"
          tone="dim"
        />
      </Section>

      <button
        disabled={amount < 10 || ratio < 150}
        className="flex items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconBorrow width={15} height={15} />
        Lock borrow rate
      </button>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        At maturity you repay the principal in full. If your collateral ratio
        drops below the liquidation threshold, the position is liquidated —
        you lose collateral but never owe more than you borrowed.
      </p>
    </div>
  );
}