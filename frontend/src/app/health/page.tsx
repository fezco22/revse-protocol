"use client";

import { useApp } from "@/state/app";
import {
  utilPercent,
  usd,
  fmtClock,
  ratePct,
} from "@/lib/format";
import { LedgerRow, Section, StewardStrip } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";

export default function HealthPage() {
  const { pool, live, events } = useApp();

  const apyPct = pool ? ratePct(pool.apyRate) : 0;
  const fixedFrac = pool
    ? pool.fixedUnits / Math.max(1, pool.tvlUnits)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Protocol health
        </h1>
        <p className="mt-1 max-w-[48ch] text-sm leading-relaxed text-ink-muted">
          The ledger behind every certificate: reserves, utilization, and the
          hedge posture that underwrites the fixed rate.
        </p>
      </header>

      <article className="border border-hairline bg-surface">
        <header className="border-b border-hairline px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">
            Pool balance sheet
          </h2>
        </header>
        {pool ? (
          <div className="px-5 py-4">
            <LedgerRow label="Total reserves" value={usd(pool.tvlUnits)} />
            <LedgerRow
              label="Fixed leg locked"
              value={usd(pool.fixedUnits)}
              tone="signal"
            />
            <LedgerRow
              label="Variable leg (hedge)"
              value={usd(pool.variableUnits)}
              tone="dim"
            />
            <LedgerRow
              label="Fixed share"
              value={`${(fixedFrac * 100).toFixed(1)}%`}
              tone="dim"
            />
            <LedgerRow
              label="Effective fixed APY"
              value={`${apyPct.toFixed(2)}%`}
              tone="signal"
            />
            <LedgerRow
              label="Utilization"
              value={utilPercent(pool.utilization)}
              tone="default"
            />
            <LedgerRow
              label="Last re-quote"
              value={fmtClock(Math.floor(pool.updatedAt / 1000))}
            />
          </div>
        ) : (
          <p className="px-5 py-8 text-sm text-ink-muted">Loading pool…</p>
        )}
      </article>

      <StewardStrip>
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center border border-signal-dim/50 text-signal">
            <IconCheck width={16} height={16} />
          </span>
          <p className="text-xs leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Hedged, not promised.</span>{" "}
            When a certificate is minted, the pool sells the fixed claim against
            its floating reserve — delta moves pay the interest, while your APY
            stays the number stamped on the paper.
          </p>
        </div>
      </StewardStrip>

      <Section title="Live events">
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">
            {live
              ? "Streaming contract events from Soroban RPC…"
              : "Demo events will appear as the market moves."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {events.map((e, i) => (
              <li
                key={`${e.name}-${i}`}
                className="num flex items-center justify-between py-2 text-xs"
              >
                <span
                  className={
                    e.name === "var_sync"
                      ? "text-ink-dim"
                      : "font-medium text-signal"
                  }
                >
                  {e.name}
                </span>
                <span className="text-ink-faint">{fmtClock(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="border border-dashed border-hairline px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-faint">
          <IconAlert width={13} height={13} className="mt-0.5 shrink-0 text-warn" />
          Risk note: this is a protocol concept build. Contracts are unit-tested
          and size-gated; mainnet audited deployments may carry different risk
          parameters than shown here.
        </p>
      </div>
    </div>
  );
}