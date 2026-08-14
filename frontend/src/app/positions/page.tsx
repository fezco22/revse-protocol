"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/state/app";
import { usd, fmtDate, fmtCountdown, termInterest, ratePct } from "@/lib/format";
import { TERM_SECONDS, isReady } from "@/lib/demo";
import { EmptyState, Section } from "@/components/ui";
import {
  IconLock,
  IconClock,
  IconCheck,
  IconAlert,
} from "@/components/icons";
import type { Position } from "@/lib/types";

export default function PositionsPage() {
  const {
    positions,
    mutStage,
    mutError,
    mutateClaim,
    mutateRepay,
    wallet,
  } = useApp();

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // A running clock so countdowns move; infra, not data.
  useEffect(() => {
    const id = setInterval(
      () => setNow((n) => n + 1),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const deposits = positions.filter((p) => p.side === "deposit");
  const borrows = positions.filter((p) => p.side === "borrow");
  const readyCount = deposits.filter(
    (p) => isReady(p.maturityTs)
  ).length;

  const busy =
    mutStage === "awaiting-sign" ||
    mutStage === "signing" ||
    mutStage === "confirming";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Portfolio
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {wallet.address ? `Connected as ${wallet.address.slice(0, 6)}…` : "Connected tool demo wallet"}
        </p>
        {readyCount > 0 && (
          <p className="num mt-3 inline-flex items-center gap-2 border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-medium text-signal">
            <IconCheck width={13} height={13} />
            {readyCount} certificate{readyCount === 1 ? "" : "s"} matured — claim your return
          </p>
        )}
      </header>

      {mutError && (
        <p
          role="alert"
          className="flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk"
        >
          <IconAlert width={14} height={14} />
          {mutError}
        </p>
      )}

      <CertificateList
        title="Deposits"
        items={deposits}
        now={now}
        busy={busy}
        onClaim={mutateClaim}
      />

      <BorrowList items={borrows} now={now} busy={busy} onRepay={mutateRepay} />

      {deposits.length === 0 && borrows.length === 0 && (
        <EmptyState
          title="No positions yet"
          body="Mint your first 30-day certificate and the fixed rate is yours."
          action={
            <a
              href="/deposit"
              className="mt-2 bg-signal px-4 py-2 text-xs font-bold text-carbon hover:bg-[#38c98e]"
            >
              Start a deposit
            </a>
          }
        />
      )}
    </div>
  );
}

function CertificateList({
  title,
  items,
  now,
  busy,
  onClaim,
}: {
  title: string;
  items: Position[];
  now: number;
  busy: boolean;
  onClaim: (id: number) => Promise<void>;
}) {
  return (
    <Section
      title={title}
      meta={<span className="num">{items.length}</span>}
    >
      {items.length === 0 ? (
        <div className="flex flex-col gap-4 py-8 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center border border-hairline text-ink-faint">
            <IconLock width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">No open deposits</p>
            <p className="mt-1 text-xs text-ink-muted">
              Every deposit is a certificate: fixed APY, dated maturity,
              real on-chain claim.
            </p>
          </div>
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
  const interest = termInterest(
    pos.amount,
    pos.apy,
    TERM_SECONDS
  );
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
            Claim {usd(returnUsd)} {pos.amount + Math.round(interest) > pos.amount ? `(${usd(Math.round(interest))} interest)` : ""}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <IconLock width={12} height={12} />
            Rate locked {fmtDate(pos.openTs)} · claimable {fmtDate(pos.maturityTs)}
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
  if (items.length === 0) return null;
  return (
    <Section title="Borrows" meta={<span className="num">{items.length}</span>}>
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
    </Section>
  );
}