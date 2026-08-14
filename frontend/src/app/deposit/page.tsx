"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/state/app";
import {
  usd,
  parseAmount,
  fmtDate,
  utilPercent,
  ratePct,
} from "@/lib/format";
import { TERM_SECONDS } from "@/lib/demo";
import { LedgerRow, Section, Spinner } from "@/components/ui";
import { IconLock, IconCheck, IconAlert, IconArrow } from "@/components/icons";

export default function DepositPage() {
  const { pool, balance, quoteFor, mutateDeposit, mutStage, mutError, live } =
    useApp();
  const router = useRouter();

  const [amount, setAmount] = useState<number>(1000);
  const [lastDone, setLastDone] = useState<number | null>(null);

  const amtUnits = useMemo(() => amount * 10_000_000, [amount]);
  const quote = useMemo(() => quoteFor(amtUnits), [amtUnits, quoteFor]);

  const apyPct = ratePct(quote.apyRate);
  const insufficient = amtUnits > balance;
  const busy =
    mutStage === "quoting" ||
    mutStage === "simulating" ||
    mutStage === "awaiting-sign" ||
    mutStage === "signing" ||
    mutStage === "confirming";

  const submit = async () => {
    if (busy) return;
    const pos = await mutateDeposit(amtUnits);
    setLastDone(pos.id);
  };

  // After success, hand over to the certificate on the positions page.
  useEffect(() => {
    if (lastDone !== null) {
      const t = setTimeout(() => router.push("/positions"), 1200);
      return () => clearTimeout(t);
    }
  }, [lastDone, router]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Lock a rate
        </h1>
        <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          You pick the amount. The VAMM quotes a fixed APY, holds it against
          its floating hedge, and mints your certificate for {TERM_SECONDS / 86_400} days.
        </p>
      </header>

      {/* Quote form */}
      <Section title="Certificate request">
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
              autoFocus
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
          <p className="num text-[11px] text-ink-faint">
            Available {usd(balance)} · min $10
          </p>
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
            {mutError} — nothing was charged. Try again.
          </p>
        )}
      </Section>

      {/* Live quote */}
      <Section title="Your locked terms" meta={live ? "on-chain quote" : "demo quote"}>
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
          label="Utilization now"
          value={pool ? utilPercent(pool.utilization) : "—"}
          tone="dim"
        />
        <LedgerRow
          label="Matures"
          value={fmtDate(quote.maturityTs)}
          tone="dim"
        />
      </Section>

      <button
        onClick={() => void submit()}
        disabled={busy || amount < 10 || insufficient}
        className="flex h-13 items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:cursor-not-allowed disabled:opacity-40"
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
            Certificate #{lastDone} minted — rate locked.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Directing you to your portfolio…
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Your certificate is a real position on-chain: principal plus interest
        is claimable at maturity, and the fixed number is underwritten by the
        pool&apos;s delta hedge rather than a promise.
      </p>
    </div>
  );
}