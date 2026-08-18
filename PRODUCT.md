# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js + TypeScript + @stellar/stellar-sdk v16 + stellar-wallets-kit (Freighter/Albedo). Soroban back end in Rust (soroban-sdk v27, stellar-cli v25+). Design tooling via the impeccable CLI/skill. Deploy via Vercel/Netlify previews from GitHub Actions. (Stack confirmed in PRD §6, §12.)

## Users

1. Crypto-native savers who want predictable, fixed yield on stablecoins instead of variable Blend/algorith sheds rates.
2. SMEs, DAOs, and treasuries that need a fixed borrowing cost for 30-day working capital.
3. DeFi power users arbitraging the fixed-vs-variable spread (this drives rate discovery).

Primary operating context: the Stellar Journey to Mastery Level 3 (Orange Belt) program, evaluated on advanced smart contracts, inter-contract communication, event streaming + real-time UI, CI/CD, tests, mobile-responsive frontend, and a live demo.

## Product Purpose

Revse is a fixed-rate lending market on Stellar. A user locks USDC for a fixed term (MVP: 30 days) at a fixed APY quoted by a Virtual AMM; idle funds are deployed to a Blend lending pool earning variable yield while the VAMM maintains a delta-hedged fixed rate. Success means a depositor can predict their yield exactly at maturity — the fixed-income layer Stellar is missing.

## Positioning

An approachable, mobile-first fixed-rate (fixed-income) lending market built on a virtual AMM interest-rate pricing engine on Stellar. XCCY (SCF #43) proved demand for fixed-income on Stellar; no one ships an approachable, mobile-first consumer version. The on-chain fixed-income math (virtual AMM for interest-rate curves) is technically deep and impossible to fake.

## Operating Context

- Users connect via Freighter/Albedo (StellarWalletsKit), deposit USDC, receive fUSDC (fixed-yield claim), and claim principal + interest at maturity.
- Protocol sits on contract topology: OracleHub -> RateVAMM -> PositionSettlement -> StrategyAdapter -> SAC + Blend pool, with SEP-49 upgradeability and TTL management.
- Frontend pages: Market (live rate card, utilization gauge), Deposit/Borrow wizards (quote-first), Positions dashboard (maturity countdown, P&L), Liquidations, Protocol health.
- Real-time updates stream contract events via Soroban RPC getEvents + SSR relay; every mutation has explicit idle/loading/signing/submitting/success/error states.
- Demo workflow: deploy to testnet with scripted hash-pinned deploy, verify tx-hashes, record in README; CI/CD in GitHub Actions.

## Capabilities and Constraints

- MVP hard-scoped: one pool, one term (30 days), one asset (USDC), one strategy (Blend). Multi-term and borrow-side collateral factors are Level 4.
- Oracle: Reflector SEP-40 Pulse, wrapped by OracleHub with allowlist, staleness and price-sanity checks.
- Yield source: Blend lending pool (variable rate) hedged by the VAMM.
- fUSDC: mintable SEP-41 contract token (mirrors ERC-4626 vault-share pattern).
- Rate model: VIMM constant-product virtual curve; fixed_apy = base_rate * (x_fixed/(x_fixed - d)); property-tested for no-free-lunch, monotonicity, solvency invariant.
- Storage: persistent (positions, reserves, config), temporary (per-call), instance (admin, allowlists); explicit TTL bump on hot keys.
- Production architecture requirements: SEP-49 upgrade guard, reentrancy guard, emergency pause, oracle allowlists.
- WASM size budget < 64KB (opt-level=z, LTO): enforces modular contract split.
- Confirmed product choice locked in: product name Revse, OracleHub+RateVAMM+PositionSettlement+StrategyAdapter contract split, fUSDC token, Reflector oracle, Blend yield source.

## Brand Commitments

- Name: Revse.
- Voice/financial framing: fixed-income, predictable yield, delta-hedged, trust through verifiable on-chain math.
- No imaged brand assets or external references have been provided; do not fabricate testimonials, pricing, or deployment claims.

## Evidence on Hand

- `PRD-revse-vamm.md` — the approved reference spec: architecture, event schema, testing strategy, roadmap L3->L7, risks, resolved decisions.
- `stellar-journey-to-mastery.md` — program requirements for Level 3 (Orange Belt).
- Event schema (PRD §5.5): fixed_quote, deposit_fixed, borrow_fixed, variable_rate_sync, allocated, maturity_claimed, liquidation, upgraded.
- No real user data, testimonials, or press exist yet. Do not fabricate deployment claims or usage numbers.

## Product Principles

1. Predictability is the product: every user-facing number (APY, maturity payout) must be exactly the on-chain math — no drift, no hidden fees.
2. Verify, don't trust: quote correctness is proven by property tests (no-arbitrage, monotonicity, solvency invariants), not claims.
3. Hedged by design: the protocol stays delta-neutral against variable-rate movement through the virtual AMM, so the fixed rate is safe to quote.
4. Production-grade by default: SEP-49 upgrades, TTL hygiene, reentrancy guards, oracle allowlists, and emergency pause are in the MVP, not later.
5. Show, don't tell: events streamed to a responsive UI with honest loading/error states make the mechanism visible in the demo.

## Accessibility & Inclusion

- Mobile-first responsive UI (MVP target device class).
- Explicit error and loading states for every mutation; clear marketing copy for a non-specialist saver audience.
- No further accessibility requirements have been established.