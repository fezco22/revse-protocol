"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/state/app";
import {
  usd,
  usdCompact,
  fmtDate,
  fmtClock,
  fmtCountdown,
  termInterest,
  ratePct,
  utilPercent,
  shortAddr,
  TERM_SECONDS,
  isReady,
} from "@/lib/format";
import { EmptyState, LedgerRow, Section } from "@/components/ui";
import { FaucetButton } from "@/components/FaucetButton";
import {
  IconLock,
  IconClock,
  IconCheck,
  IconAlert,
  IconWallet,
} from "@/components/icons";
import type { Position } from "@/lib/types";

export default function DashboardPage() {
  const {
    wallet,
    pool,
    positions,
    events,
    balance,
    connectedWallet,
    mutStage,
    mutError,
    mutateClaim,
    mutateRepay,
  } = useApp();

  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNow(Math.floor(Date.now() / 1000)), 0);
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  const deposits = positions.filter((p) => p.side === "deposit");
  const borrows = positions.filter((p) => p.side === "borrow");
  const readyCount = deposits.filter((p) => isReady(p.maturityTs)).length;

  const totalDeposited = deposits.reduce((s, p) => s + p.amount, 0);
  const projectedReturn = deposits.reduce(
    (s, p) => s + p.amount + termInterest(p.amount, p.apy, TERM_SECONDS),
    0
  );
  const projectedInterest = projectedReturn - totalDeposited;
  const totalBorrowed = borrows.reduce((s, p) => s + p.amount, 0);

  const busy =
    mutStage === "awaiting-sign" ||
    mutStage === "signing" ||
    mutStage === "confirming";

  const empty = deposits.length === 0 && borrows.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ============ PROFILE HEADER ============ */}
      <header className="flex flex-col gap-5 border-b border-hairline pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center border border-hairline bg-surface text-signal">
            <IconWallet width={24} height={24} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Dashboard
            </h1>
            <p className="num mt-0.5 text-xs text-ink-muted">
              {wallet.address ? shortAddr(wallet.address, 6, 6) : "Not connected"}
              {connectedWallet && (
                <span className="ml-2 uppercase tracking-[0.14em] text-ink-faint">
                  {connectedWallet}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-ink-muted">
              USDC balance
            </p>
            <p className="num mt-0.5 text-xl font-semibold text-ink">
              {usd(balance)}
            </p>
          </div>
          <FaucetButton label="Get USDC" />
        </div>
      </header>

      {readyCount > 0 && (
        <p className="num inline-flex items-center gap-2 self-start border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-medium text-signal">
          <IconCheck width={13} height={13} />
          {readyCount} certificate{readyCount === 1 ? "" : "s"} matured. Claim
          your return.
        </p>
      )}

      {mutError && (
        <p
          role="alert"
          className="flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk"
        >
          <IconAlert width={14} height={14} />
          {mutError}
        </p>
      )}

      {/* ============ STAT TILES ============ */}
      <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline lg:grid-cols-4">
        <Stat label="Total deposited" value={usd(totalDeposited, 0)} />
        <Stat
          label="Projected interest"
          value={usd(projectedInterest, 0)}
          tone="signal"
        />
        <Stat
          label="Active positions"
          value={String(deposits.length + borrows.length)}
        />
        <Stat
          label="Total borrowed"
          value={usd(totalBorrowed, 0)}
        />
      </div>

      {empty ? (
        <EmptyState
          title="No positions yet"
          body="Mint your first 30-day certificate and the fixed rate is yours."
          action={
            <a
              href="/market"
              className="mt-2 bg-signal px-4 py-2 text-xs font-bold text-carbon hover:bg-[#38c98e]"
            >
              Start a deposit
            </a>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <CertificateList
            items={deposits}
            now={now}
            busy={busy}
            onClaim={mutateClaim}
          />
          <BorrowList
            items={borrows}
            now={now}
            busy={busy}
            onRepay={mutateRepay}
          />
        </div>
      )}

      {/* ============ PROTOCOL HEALTH ============ */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <article className="border border-hairline bg-surface">
          <header className="border-b border-hairline px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">
              Protocol health
            </h2>
          </header>
          {pool ? (
            <div className="px-5 py-4">
              <LedgerRow label="Total reserves" value={usdCompact(pool.tvlUnits)} />
              <LedgerRow
                label="Fixed leg locked"
                value={usdCompact(pool.fixedUnits)}
                tone="signal"
              />
              <LedgerRow
                label="Variable hedge"
                value={usdCompact(pool.variableUnits)}
                tone="dim"
              />
              <LedgerRow
                label="Effective fixed APY"
                value={`${ratePct(pool.apyRate).toFixed(2)}%`}
                tone="signal"
              />
              <LedgerRow
                label="Utilization"
                value={utilPercent(pool.utilization)}
              />
              <LedgerRow
                label="Last re-quote"
                value={fmtClock(Math.floor(pool.updatedAt / 1000))}
                tone="dim"
              />
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-ink-muted">Loading pool…</p>
          )}
          <p className="border-t border-hairline px-5 py-4 text-[11px] leading-relaxed text-ink-faint">
            When a certificate is minted, the pool sells the fixed claim against
            its floating reserve; delta moves pay the interest, while your APY
            stays the number stamped on the paper.
          </p>
        </article>

        <Section title="Live events">
          {events.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">
              No events yet. Activity appears here as the market moves.
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
      </div>

      <div className="border border-dashed border-hairline px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-faint">
          <IconAlert width={13} height={13} className="mt-0.5 shrink-0 text-warn" />
          This is a protocol concept build on Stellar testnet. Contracts are
          unit-tested and size-gated; audited mainnet deployments may carry
          different risk parameters.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "signal";
}) {
  return (
    <div className="bg-carbon p-5">
      <p className="num text-[10px] uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p
        className={`num mt-2 text-2xl font-semibold ${
          tone === "signal" ? "text-signal" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CertificateList({
  items,
  now,
  busy,
  onClaim,
}: {
  items: Position[];
  now: number;
  busy: boolean;
  onClaim: (id: number) => Promise<void>;
}) {
  return (
    <Section title="Deposits" meta={<span className="num">{items.length}</span>}>
      {items.length === 0 ? (
        <div className="flex flex-col gap-4 py-8 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center border border-hairline text-ink-faint">
            <IconLock width={18} height={18} />
          </span>
          <p className="text-xs text-ink-muted">
            No open deposits. Every deposit is a certificate: fixed APY, dated
            maturity, real on-chain claim.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((p) => (
            <DepositLine
              key={p.id}
              pos={p}
              now={now}
              busy={busy}
              onClaim={onClaim}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function DepositLine({
  pos,
  now,
  busy,
  onClaim,
}: {
  pos: Position;
  now: number;
  busy: boolean;
  onClaim: (id: number) => Promise<void>;
}) {
  const ready = isReady(pos.maturityTs);
  const apyPct = ratePct(pos.apy);
  const interest = termInterest(pos.amount, pos.apy, TERM_SECONDS);
  const returnUsd = pos.amount + interest;

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            Cert #{pos.id} · {usd(pos.amount, 0)}
          </p>
          <p className="num mt-1 text-2xl font-semibold text-ink">
            <span className={ready ? "text-signal" : ""}>
              {apyPct.toFixed(2)}%
            </span>
          </p>
          <p className="num mt-0.5 text-xs text-ink-dim">
            return {usd(returnUsd)}
          </p>
        </div>
        <div className="text-right">
          {ready ? (
            <span className="inline-flex items-center gap-1.5 border border-signal/50 bg-signal/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">
              <IconCheck width={12} height={12} /> Matured
            </span>
          ) : (
            <span className="num inline-flex items-center gap-1.5 border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
              <IconClock width={12} height={12} />
              {fmtCountdown(now, pos.maturityTs)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        {ready ? (
          <button
            onClick={() => void onClaim(pos.id)}
            disabled={busy}
            className="w-full border border-signal bg-signal/10 px-4 py-2.5 text-xs font-semibold text-signal transition-colors hover:bg-signal hover:text-carbon disabled:opacity-50"
          >
            Claim {usd(returnUsd)}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <IconLock width={12} height={12} />
            Rate locked {fmtDate(pos.openTs)} · claimable{" "}
            {fmtDate(pos.maturityTs)}
          </div>
        )}
      </div>
    </li>
  );
}

function BorrowList({
  items,
  now,
  busy,
  onRepay,
}: {
  items: Position[];
  now: number;
  busy: boolean;
  onRepay: (id: number) => Promise<void>;
}) {
  return (
    <Section title="Borrows" meta={<span className="num">{items.length}</span>}>
      {items.length === 0 ? (
        <div className="flex flex-col gap-4 py-8 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center border border-hairline text-ink-faint">
            <IconClock width={18} height={18} />
          </span>
          <p className="text-xs text-ink-muted">
            No open borrows. Post USDC collateral to borrow at a fixed rate.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((p) => {
            const ready = isReady(p.maturityTs);
            const apyPct = ratePct(p.apy);
            return (
              <li key={p.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="num text-[11px] uppercase tracking-[0.14em] text-ink-muted">
                      Loan #{p.id} · {usd(p.amount, 0)} at fixed
                    </p>
                    <p className="num mt-1 text-2xl font-semibold text-ink">
                      {apyPct.toFixed(2)}%
                    </p>
                    <p className="num mt-0.5 text-xs text-ink-dim">
                      collateral {usd(p.collateral)}
                    </p>
                  </div>
                  <span className="num inline-flex items-center gap-1.5 border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                    <IconClock width={12} height={12} />
                    {fmtCountdown(now, p.maturityTs)}
                  </span>
                </div>
                <button
                  onClick={() => void onRepay(p.id)}
                  disabled={busy || !ready}
                  className="mt-3 w-full border border-hairline px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:border-ink-muted hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ready ? "Repay principal only" : "Repay at maturity"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
