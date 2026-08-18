"use client";

import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/state/app";
import { parseAmount } from "@/lib/format";
import {
  fetchStellarBalances,
  fetchSwapEstimate,
  type SwapEstimate,
} from "@/lib/chain";
import { Section, LedgerRow, Spinner } from "@/components/ui";
import { IconSwap, IconCheck, IconAlert, IconArrow } from "@/components/icons";

const SLIPPAGE = 0.01; // 1%

export default function SwapPage() {
  const { wallet, mutStage, mutError, addUsdcTrust, swapXlmToUsdc } = useApp();

  const [xlm, setXlm] = useState(100);
  const [xlmBalance, setXlmBalance] = useState<number | null>(null);
  const [hasTrust, setHasTrust] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [done, setDone] = useState(false);

  const reload = useCallback(() => {
    if (!wallet.address) {
      setXlmBalance(null);
      setHasTrust(null);
      return;
    }
    fetchStellarBalances(wallet.address).then((bs) => {
      setXlmBalance(bs.find((b) => b.code === "XLM")?.balance ?? 0);
      setHasTrust(bs.some((b) => b.code === "USDC" && !b.native));
    });
  }, [wallet.address]);

  useEffect(() => {
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [reload]);

  // Debounced quote for the entered XLM amount.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!(xlm > 0)) {
        setEstimate(null);
        setEstimating(false);
        return;
      }
      setEstimating(true);
      fetchSwapEstimate(xlm).then((e) => {
        if (alive) {
          setEstimate(e);
          setEstimating(false);
        }
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [xlm]);

  const busy =
    mutStage === "awaiting-sign" ||
    mutStage === "signing" ||
    mutStage === "confirming";

  const minOut = estimate ? estimate.out * (1 - SLIPPAGE) : 0;
  const rate = estimate && xlm > 0 ? estimate.out / xlm : 0;
  const insufficient = xlmBalance !== null && xlm > Math.max(0, xlmBalance - 1);

  const doTrust = async () => {
    if (busy) return;
    await addUsdcTrust();
    reload();
  };

  const doSwap = async () => {
    if (busy || !estimate) return;
    await swapXlmToUsdc(xlm, minOut, estimate.path);
    setDone(true);
    reload();
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Swap</h1>
        <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
          Convert XLM to USDC directly on the Stellar DEX, then use it to deposit
          or post collateral. One signature, no external site.
        </p>
      </header>

      <Section title="Swap" meta={<span className="num">XLM → USDC</span>}>
        {/* FROM */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="swap-xlm"
              className="text-[11px] uppercase tracking-[0.14em] text-ink-muted"
            >
              You pay
            </label>
            <span className="num text-[11px] text-ink-faint">
              Balance{" "}
              {xlmBalance === null
                ? "·"
                : xlmBalance.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
              XLM
            </span>
          </div>
          <div className="flex items-center border border-hairline bg-carbon focus-within:border-ink-muted">
            <input
              id="swap-xlm"
              inputMode="decimal"
              value={xlm}
              onChange={(e) => setXlm(Math.max(0, parseAmount(e.target.value)))}
              className="num w-full bg-transparent px-4 py-3.5 text-2xl text-ink caret-signal focus:outline-none"
            />
            <span className="num flex items-center gap-2 pr-3">
              {xlmBalance !== null && (
                <button
                  onClick={() =>
                    setXlm(Math.max(0, Math.floor(xlmBalance - 1)))
                  }
                  className="border border-hairline px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted hover:border-ink-muted hover:text-signal"
                >
                  Max
                </button>
              )}
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">
                XLM
              </span>
            </span>
          </div>
        </div>

        {/* arrow */}
        <div className="my-3 flex justify-center">
          <span className="grid h-8 w-8 rotate-90 place-items-center border border-hairline text-ink-muted">
            <IconSwap width={16} height={16} />
          </span>
        </div>

        {/* TO */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            You receive (estimated)
          </label>
          <div className="flex items-center justify-between border border-hairline bg-surface px-4 py-3.5">
            <span className="num text-2xl text-ink">
              {estimating ? (
                <Spinner size={18} />
              ) : estimate ? (
                estimate.out.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })
              ) : (
                "0.00"
              )}
            </span>
            <span className="num text-[11px] uppercase tracking-wide text-ink-faint">
              USDC
            </span>
          </div>
        </div>

        {estimate && (
          <div className="mt-4">
            <LedgerRow
              label="Rate"
              value={`1 XLM ≈ ${rate.toFixed(4)} USDC`}
              tone="dim"
            />
            <LedgerRow
              label="Minimum received (1% slippage)"
              value={`${minOut.toFixed(2)} USDC`}
            />
          </div>
        )}

        {insufficient && (
          <p className="mt-3 flex items-center gap-2 border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-risk">
            <IconAlert width={14} height={14} />
            Not enough XLM (keep ~1 XLM for fees and reserve).
          </p>
        )}

        {estimate === null && xlm > 0 && !estimating && (
          <p className="mt-3 flex items-center gap-2 border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
            <IconAlert width={14} height={14} />
            No swap route found for this amount right now.
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
      </Section>

      {!wallet.address ? (
        <p className="text-center text-xs text-ink-muted">
          Connect a wallet to swap.
        </p>
      ) : hasTrust === false ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => void doTrust()}
            disabled={busy}
            className="flex min-h-[52px] items-center justify-center gap-2 border border-signal bg-signal/10 px-5 py-3.5 text-sm font-semibold text-signal transition-colors hover:bg-signal hover:text-carbon disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : <IconArrow width={15} height={15} />}
            Add USDC trustline first
          </button>
          <p className="text-center text-[11px] text-ink-faint">
            Your account needs a USDC trustline before it can receive USDC (one
            time).
          </p>
        </div>
      ) : (
        <button
          onClick={() => void doSwap()}
          disabled={busy || !estimate || insufficient || xlm <= 0}
          className="flex min-h-[52px] items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <>
              <Spinner size={16} />
              {mutStage === "signing" ? "Signing…" : "Swapping…"}
            </>
          ) : (
            <>
              <IconSwap width={15} height={15} />
              Swap XLM for USDC
            </>
          )}
        </button>
      )}

      {done && (
        <div className="stamp border border-signal/50 bg-signal/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-signal">
            <IconCheck width={15} height={15} />
            Swap complete. USDC is in your wallet.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            You can now deposit or post it as collateral.
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Swaps route through the Stellar DEX (order books + AMM pools) via a path
        payment. Testnet prices are not real market rates.
      </p>
    </div>
  );
}
