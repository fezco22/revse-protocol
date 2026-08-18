"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/state/app";
import {
  TERM_DAYS,
  usd,
  parseAmount,
  ratePct,
  termInterest,
  fmtDate,
  TERM_SECONDS,
} from "@/lib/format";
import { fetchStellarBalances, type StellarBalance } from "@/lib/chain";
import { LedgerRow, Section, Spinner } from "@/components/ui";
import { FaucetButton } from "@/components/FaucetButton";
import { IconLock, IconArrow, IconWallet, IconAlert } from "@/components/icons";

export default function SimulatePage() {
  const { wallet, pool, quoteFor } = useApp();

  const [balances, setBalances] = useState<StellarBalance[] | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [touched, setTouched] = useState(false);

  // Pull the connected account's real Stellar holdings from Horizon. Deferred
  // to a post-render tick so no state is set synchronously in the effect body.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!wallet.address) {
        setBalances([]);
        return;
      }
      setBalances(null);
      fetchStellarBalances(wallet.address).then((b) => {
        if (alive) setBalances(b);
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [wallet.address]);

  const usdcHolding = balances?.find((b) => b.code === "USDC")?.balance ?? null;

  // Seed the simulator from the USDC holding, once. Deferred to a post-render
  // tick so state is never set synchronously inside the effect.
  useEffect(() => {
    if (touched) return;
    const t = setTimeout(() => {
      if (usdcHolding && usdcHolding > 0) setAmount(Math.floor(usdcHolding));
    }, 0);
    return () => clearTimeout(t);
  }, [usdcHolding, touched]);

  const amtUnits = useMemo(() => Math.round(amount * 10_000_000), [amount]);
  const quote = useMemo(
    () => (amtUnits > 0 ? quoteFor(amtUnits) : null),
    [amtUnits, quoteFor]
  );

  const apyPct = quote ? ratePct(quote.apyRate) : pool ? ratePct(pool.apyRate) : 0;
  const interest = quote ? quote.interestUnits : termInterest(amtUnits, 0, TERM_SECONDS);
  const termYieldPct = (apyPct * TERM_DAYS) / 365;
  const returnUnits = amtUnits + Math.round(interest);
  const maturityTs = quote?.maturityTs ?? 0;

  // Slider ceiling: your USDC holding (floored, so dragging to the end never
  // exceeds your balance) or a flat cap when there is nothing to price against.
  const sliderMax =
    usdcHolding && usdcHolding > 0 ? Math.max(1, Math.floor(usdcHolding)) : 100_000;

  const setFromBalance = (v: number) => {
    setTouched(true);
    setAmount(Math.max(0, Math.floor(v)));
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Simulate
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-muted">
          Price a fixed-rate deposit against what you actually hold. Enter a
          principal, and the virtual AMM quotes the exact rate and payout you
          would lock for a {TERM_DAYS}-day term.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        {/* ============ LEFT: assets + input ============ */}
        <div className="flex flex-col gap-6">
          <Section
            title="Your Stellar assets"
            meta={
              wallet.address ? (
                <span className="num text-ink-faint">from Horizon</span>
              ) : null
            }
          >
            {!wallet.address ? (
              <div className="flex flex-col items-start gap-3 py-2">
                <p className="text-sm text-ink-muted">
                  Connect a wallet to price against your real balances.
                </p>
              </div>
            ) : balances === null ? (
              <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
                <Spinner size={15} />
                Reading balances from Horizon…
              </div>
            ) : balances.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {balances.map((b) => (
                  <li
                    key={`${b.code}-${b.issuer ?? "native"}`}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="num grid h-8 w-8 place-items-center border border-hairline text-[11px] text-ink-dim">
                        {b.code.slice(0, 4)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{b.code}</p>
                        <p className="text-[11px] text-ink-faint">
                          {b.native ? "Native asset" : "Issued asset"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num text-sm text-ink">
                        {b.balance.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {b.code === "USDC" && b.balance > 0 && (
                        <button
                          onClick={() => setFromBalance(b.balance)}
                          className="num border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted hover:border-ink-muted hover:text-signal"
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 py-2">
                <p className="flex items-start gap-2 text-sm text-ink-muted">
                  <IconAlert
                    width={14}
                    height={14}
                    className="mt-0.5 shrink-0 text-warn"
                  />
                  No balances on this testnet account yet. Get test USDC from the
                  Circle faucet, then it appears here.
                </p>
                <FaucetButton />
              </div>
            )}
          </Section>

          <Section title="Principal to simulate">
            <div className="flex flex-col gap-4">
              <div className="flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
                <span className="pl-4 text-sm text-ink-faint">$</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setTouched(true);
                    setAmount(Math.max(0, parseAmount(e.target.value)));
                  }}
                  className="num w-full bg-transparent px-3 py-3.5 text-2xl text-ink caret-signal focus:outline-none"
                />
                <span className="num pr-4 text-[11px] uppercase tracking-wide text-ink-faint">
                  USDC
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={Math.min(Math.round(amount), sliderMax)}
                onChange={(e) => {
                  setTouched(true);
                  setAmount(Number(e.target.value));
                }}
                className="w-full accent-[#4de3a1]"
                aria-label="Principal"
              />

              <div className="flex flex-wrap gap-2">
                {[1000, 5000, 25000, 100000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setFromBalance(v)}
                    className="num border border-hairline px-3 py-1.5 text-[11px] text-ink-muted hover:border-ink-muted hover:text-signal"
                  >
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* ============ RIGHT: projection ============ */}
        <div className="flex flex-col gap-6">
          <article className="border border-hairline bg-surface shadow-paper">
            <div className="border-b border-hairline px-5 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                Projected outcome
              </p>
              <p className="num mt-0.5 text-[11px] text-ink-faint">
                {TERM_DAYS}-day fixed term · quoted by the VAMM
              </p>
            </div>

            <div className="px-5 pb-5 pt-6">
              <p className="text-xs text-ink-muted">Locked fixed APY</p>
              <p className="num mt-2 text-6xl font-semibold tracking-tight text-ink">
                {apyPct.toFixed(2)}
                <span className="text-3xl text-signal">%</span>
              </p>
              <p className="num mt-2 text-xs text-ink-muted">
                {termYieldPct.toFixed(2)}% over {TERM_DAYS} days · matures{" "}
                <span className="text-ink-dim">
                  {maturityTs ? fmtDate(maturityTs) : "·"}
                </span>
              </p>
            </div>

            <div className="border-t border-hairline px-5 py-3">
              <LedgerRow label="Principal" value={usd(amtUnits)} />
              <LedgerRow
                label="Interest at maturity"
                value={usd(Math.round(interest))}
              />
              <LedgerRow
                label="Return at maturity"
                value={usd(returnUnits)}
                tone="signal"
              />
              <LedgerRow
                label="Utilization now"
                value={pool ? `${((pool.utilization / 1e9) * 100).toFixed(1)}%` : "·"}
                tone="dim"
              />
            </div>
          </article>

          {/* fixed vs floating */}
          <div className="border border-hairline bg-surface">
            <div className="border-b border-hairline px-5 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                Fixed vs floating
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-hairline">
              <div className="bg-surface p-5">
                <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  Revse fixed
                </p>
                <p className="num mt-1 text-2xl font-semibold text-signal">
                  {apyPct.toFixed(2)}%
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  locked for the whole term
                </p>
              </div>
              <div className="bg-surface p-5">
                <p className="num text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  Variable pool
                </p>
                <p className="num mt-1 text-2xl font-semibold text-ink">
                  drifts
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  re-prices every ledger (~5s)
                </p>
              </div>
            </div>
            <p className="px-5 py-4 text-[11px] leading-relaxed text-ink-muted">
              A variable pool can pay more or less than the fixed rate over the
              term. Revse converts that uncertainty into one number you keep, no
              matter where the market moves.
            </p>
          </div>

          <Link
            href="/market"
            className="group flex items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e]"
          >
            <IconLock width={15} height={15} />
            Lock this rate
            <IconArrow
              width={16}
              height={16}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>

          {!wallet.address && (
            <p className="flex items-center justify-center gap-2 text-[11px] text-ink-faint">
              <IconWallet width={13} height={13} />
              Connect a wallet to deposit at this rate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
