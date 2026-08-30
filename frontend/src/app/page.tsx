"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/state/app";
import { TERM_DAYS, ratePct, usdCompact } from "@/lib/format";
import { RateSurface } from "@/components/RateSurface";
import { ScrollReveal } from "@/components/ScrollReveal";
import { FaucetButton } from "@/components/FaucetButton";
import { IconWallet, IconArrow, IconCheck, IconAlert } from "@/components/icons";

export default function LandingPage() {
  const { wallet, pool } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<"freighter" | "albedo" | null>(null);

  const apyPct = pool ? ratePct(pool.apyRate) : null;
  const dash = "·";

  const enter = async (kind: "freighter" | "albedo") => {
    if (busy || wallet.connecting) return;
    setBusy(kind);
    try {
      await wallet.connect(kind);
      router.push("/market");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full">
      {/* ============ HERO ============ */}
      <section className="relative w-full overflow-hidden border-b border-hairline">
        <div className="absolute inset-0">
          <RateSurface />
          <div className="absolute inset-0 bg-gradient-to-b from-carbon/70 via-carbon/25 to-carbon" />
          <div className="absolute inset-0 bg-gradient-to-r from-carbon via-carbon/55 to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-6xl flex-col justify-center px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.3em] text-ink-muted">
              Fixed-income layer for Stellar
            </p>

            <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.0] tracking-tight text-ink sm:text-6xl lg:text-[5.25rem]">
              Lock a fixed yield
              <br />
              on your USDC.
            </h1>

            <p className="mt-7 max-w-[46ch] text-base leading-relaxed text-ink-dim">
              Deposit for {TERM_DAYS} days and the rate stamped on your
              certificate is the rate you get. Held by a delta-hedged virtual
              AMM, not promised.
            </p>

            <div className="mt-11 flex items-end gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-ink-muted">
                  Current fixed APY
                </p>
                <p className="num mt-2 text-7xl font-semibold leading-none tracking-tight text-ink lg:text-8xl">
                  {apyPct !== null ? apyPct.toFixed(2) : "0.00"}
                  <span className="text-4xl text-signal">%</span>
                </p>
              </div>
              <p className="num mb-2 text-[11px] leading-relaxed text-ink-faint">
                {TERM_DAYS}-day term
                <br />
                fixed, not floating
              </p>
            </div>

            <div className="mt-11 grid max-w-md gap-3 sm:grid-cols-2">
              <button
                onClick={() => void enter("freighter")}
                disabled={Boolean(busy)}
                className="group flex items-center justify-center gap-2 bg-signal px-5 py-3.5 text-sm font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:opacity-50"
              >
                {busy === "freighter" ? (
                  <span className="num animate-pulse">Connecting</span>
                ) : (
                  <>
                    <IconWallet width={15} height={15} />
                    Connect Freighter
                  </>
                )}
              </button>
              <button
                onClick={() => void enter("albedo")}
                disabled={Boolean(busy)}
                className="flex items-center justify-center gap-2 border border-hairline bg-carbon/40 px-5 py-3.5 text-sm font-medium text-ink backdrop-blur-sm transition-colors hover:border-ink-muted hover:text-signal disabled:opacity-50"
              >
                {busy === "albedo" ? (
                  <span className="num animate-pulse">Connecting</span>
                ) : (
                  "Continue with Albedo"
                )}
              </button>
            </div>

            <div className="mt-5 flex max-w-md flex-wrap items-center gap-4 text-[11px] text-ink-faint">
              <span>On Stellar testnet. Your key stays in your wallet.</span>
              <FaucetButton label="Need testnet USDC?" />
            </div>

            {wallet.connected && (
              <p className="num mt-6 inline-flex items-center gap-2 border border-signal/40 bg-signal/10 px-3 py-2 text-xs font-medium text-signal">
                <IconCheck width={13} height={13} />
                Connected. Taking you to the market.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ============ PRODUCT SHOWCASE ============ */}
      <section className="relative overflow-hidden border-b border-hairline py-24 lg:py-32">
        {/* soft mint glow behind the device */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[820px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[120px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(77,227,161,0.35) 0%, rgba(77,227,161,0.10) 45%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <ScrollReveal>
            <p className="text-[11px] uppercase tracking-[0.28em] text-ink-muted">
              Your whole position, one screen
            </p>
            <h2 className="mx-auto mt-4 max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Deposit, borrow, and track fixed yield in a single dashboard.
            </h2>
          </ScrollReveal>

          <ScrollReveal pop delay={120} className="mt-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mockup.png"
              alt="Revse dashboard on a laptop, showing deposits, protocol health, and live events"
              className="mx-auto w-full max-w-5xl select-none drop-shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
          </ScrollReveal>
        </div>

        {/* fade the device into the page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-carbon" />
      </section>

      {/* ============ FACTS STRIP ============ */}
      <section className="border-b border-hairline">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          {[
            { k: "Term", v: `${TERM_DAYS} days` },
            { k: "Asset", v: "USDC" },
            { k: "Rate", v: "Fixed" },
            { k: "Settlement", v: "On-chain" },
          ].map(({ k, v }) => (
            <div key={k} className="bg-carbon px-6 py-6">
              <p className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                {k}
              </p>
              <p className="mt-2 text-lg font-medium text-ink">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-ink-muted">
              How it works
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Three steps to a rate you can count on.
            </h2>
          </div>

          <ol>
            {[
              {
                title: "Connect your wallet",
                body: "Sign in with Freighter or Albedo. Nothing is deposited until you choose.",
              },
              {
                title: "Lock your rate",
                body: `Deposit USDC for ${TERM_DAYS} days. The current fixed APY is stamped onto your certificate at open.`,
              },
              {
                title: "Claim at maturity",
                body: "At the end of the term, claim your principal plus exactly the interest the certificate promised.",
              },
            ].map(({ title, body }, i) => (
              <li
                key={title}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-hairline py-8 first:border-t-0 first:pt-0"
              >
                <span className="num text-4xl font-semibold leading-none text-ink-faint">
                  0{i + 1}
                </span>
                <div>
                  <p className="text-lg font-medium text-ink">{title}</p>
                  <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ THE HEDGE ============ */}
      <section className="border-y border-hairline bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-24 lg:grid-cols-2 lg:gap-20 lg:py-32">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-ink-muted">
              The mechanism
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              A rate that is held,
              <br />
              not promised.
            </h2>
            <p className="mt-6 max-w-[48ch] text-sm leading-relaxed text-ink-muted">
              When you mint a certificate, the pool sells your fixed claim
              against its floating reserve. Market moves pay the interest, and
              your APY stays the number on the paper. The virtual AMM keeps the
              book delta-neutral against the variable-rate feed, so the quote is
              always safe to hold.
            </p>
            <p className="mt-8 flex items-start gap-2 text-[11px] leading-relaxed text-ink-faint">
              <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />
              This is a protocol concept build. Contracts are unit-tested and
              size-gated; audited mainnet deployments may carry different risk
              parameters than shown here.
            </p>
          </div>

          {/* ledger, not cards */}
          <dl className="self-start border border-hairline">
            {[
              {
                k: "Fixed leg",
                v: pool ? usdCompact(pool.fixedUnits) : "0",
                note: "your locked claims",
                signal: true,
              },
              {
                k: "Variable hedge",
                v: pool ? usdCompact(pool.variableUnits) : "0",
                note: "the floating reserve",
              },
              {
                k: "Fixed APY",
                v: apyPct !== null ? `${apyPct.toFixed(2)}%` : "0.00%",
                note: "quoted live by the VAMM",
                signal: true,
              },
              {
                k: "Term",
                v: `${TERM_DAYS} days`,
                note: `one asset ${dash} USDC`,
              },
            ].map(({ k, v, note, signal }) => (
              <div
                key={k}
                className="flex items-baseline justify-between border-b border-hairline px-6 py-5 last:border-0"
              >
                <div>
                  <dt className="text-sm text-ink">{k}</dt>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{note}</p>
                </div>
                <dd
                  className={`num text-2xl font-semibold ${
                    signal ? "text-signal" : "text-ink"
                  }`}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ============ CTA BAND ============ */}
      <section className="mx-auto w-full max-w-6xl px-6 py-28 lg:py-36">
        <div className="flex flex-col items-start gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Predictable yield,
              <br />
              stamped on-chain.
            </h2>
            <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-ink-dim">
              Connect a wallet and mint your first {TERM_DAYS}-day certificate.
              The rate you see is the rate you keep.
            </p>
          </div>

          <button
            onClick={() => void enter("freighter")}
            disabled={Boolean(busy)}
            className="group flex shrink-0 items-center gap-3 bg-signal px-8 py-4 text-base font-bold text-carbon transition-colors hover:bg-[#38c98e] disabled:opacity-50"
          >
            Get started
            <IconArrow
              width={18}
              height={18}
              className="transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-hairline bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-[4px] border border-hairline bg-carbon">
                  <FootMark />
                </span>
                <span className="text-sm font-semibold tracking-tight text-ink">
                  Revse
                </span>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                The fixed-income layer for Stellar. Lock a fixed rate on your
                stablecoins, backed by a delta-hedged virtual AMM.
              </p>
            </div>

            <nav className="grid grid-cols-2 gap-x-14 gap-y-3 sm:grid-cols-2">
              <FootCol
                title="Product"
                links={[
                  ["Market", "/market"],
                  ["Simulate", "/simulate"],
                ]}
              />
              <FootCol
                title="Protocol"
                links={[
                  ["Borrow", "/borrow"],
                  ["Dashboard", "/positions"],
                ]}
              />
            </nav>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
            <p className="num">© 2026 Revse {dash} Protocol concept build</p>
            <p className="num uppercase tracking-[0.16em]">Built on Stellar</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FootCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        {title}
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link
              href={href}
              className="text-xs text-ink-muted transition-colors hover:text-signal"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FootMark() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden="true">
      <path
        d="M7 18V6l5 10 5-10v12"
        fill="none"
        stroke="#E7E4DE"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 20h12" stroke="#4DE3A1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
