# PRD: "Revse" — Fixed-Rate Lending Market on Stellar (Virtual AMM / Interest-Rate Swap Engine)

**Program:** Stellar Journey to Mastery — Level 3 (Orange Belt)
**Status:** v1.0 (decisions resolved)
**Date:** Aug 2026

---

## 1. Problem Statement

- Variable-rate lending (Blend/Alula pools) means borrowers and depositors cannot predict cash flow — interest changes with utilization every ledger close (~5s).
- Institutions, DAOs, and SMEs need fixed-rate instruments (lock a deposit APY or a borrowing cost for a term). This layer is missing on Stellar. XCCY (SCF #43) proved demand; no one builds an approachable, mobile-first version.
- On-chain fixed-income math (virtual AMM for interest-rate swaps) is technically deep, non-mainstream, and impossible to fake.

## 2. Why Stellar (not Ethereum/Solana)

| Stellar tech | Role in this product |
|---|---|
| Soroban smart contracts (Rust, soroban-sdk v27, stellar-cli v25+) | All protocol logic; parallel execution (Protocol 23 Whisk) |
| SAC + SEP-41 token interface (TokenInterface) | Standardized USDC/XLM transfer & events across contracts |
| Reflector SEP-40 oracles (Pulse) | Real-time USDC/XLM + variable-rate feeds for mark-to-market |
| Blend protocol (SCF-backed lending primitive) | Variable-yield source that the VIMM hedges |
| SEP-49 upgradeability (native WASM swap) | Production-ready upgrade path for the VAMM |
| Contract constructors (Protocol 22+) | One-time init per contract |
| Events (indexed) | Real-time UI streaming via Soroban RPC getEvents |
| Stellar Router SDK (Creit-Tech) | Atomic multi-contract calls in one tx (deposit -> quote -> allocate) |
| Protocol 24+ state archival / TTL mgmt | Storage hygiene + security (TTL extension) |
| StellarWalletsKit / Freighter | Multi-wallet connect (carried from L2) |

## 3. Product Concept (MVP scope — one pool, one term, one asset)

> A user locks **USDC** for **30 days** at a **fixed APY** quoted by the protocol. Underlying idle funds are deployed to a **Blend lending pool** earning variable yield. The **Virtual AMM** prices the fixed rate so the protocol is delta-hedged: the fixed rate is a function of pool utilization + variable-rate expectations, matched via virtual reserves (no real AMM liquidity needed).

- **Depositor:** deposit USDC -> receive fUSDC (fixed-yield claim) -> at maturity, withdraw principal + fixed interest.
- **Borrower (fixed-rate):** borrow USDC at fixed cost for the term (backed by over-collateralization, Blend-style factors).
- **Market:** the VIMM quotes one fixed APY; utilization + oracle-driven variable-rate feed set the rate.

## 4. Target Users

1. Crypto-native savers wanting predictable yield (vs. volatile Blend rates).
2. SMEs/DAOs/treasuries needing fixed borrowing cost for 30-day working capital.
3. DeFi power users arbitraging the fixed-vs-variable spread (provides rate discovery).

## 5. Technical Architecture

### 5.1 Contract topology (inter-contract communication)

```
                        +-----------------------------+
                        |  OracleHub (SEP-40 wrapper)  |
                        |  Reflector feed + stale check|
                        +--------------+--------------+
                                       | get_feed(), get_variable_rate()
+--------------+   quote/mark   +------v--------------+   allocate/withdraw  +------------------+
|   SAC Token  |<--transfer-----|   RateVAMM          |<---------------------|  StrategyAdapter  |
| (USDC, SEP-41)|               | virtual reserves   |   deploy idle funds   |  (Blend pool)    |
+--------------+               | fixed-rate pricing |                       +------------------+
                               +------+--------------+
                                      | mint/redeem fUSDC, settle positions
                               +------v--------------+
                               |  PositionSettlement |  (positions, maturity,
                               |  vault, liquidation |   repay, claim)
                               +---------------------+
```

| Contract | Responsibility | Key entrypoints |
|---|---|---|
| **OracleHub** | Wraps Reflector SEP-40 Pulse oracles; allowlist of trusted feeds; staleness/price sanity checks | get_price(asset), get_variable_rate(pool_id), set_feed() |
| **RateVAMM** | The virtual AMM: maintains virtual reserves (x_fixed, y_variable), quotes fixed_apy = f(utilization, var_rate), constant-product pricing on virtual balances, emits rate updates | quote(term, amount), deposit_fixed(), borrow_fixed(), mark_to_market() |
| **PositionSettlement** | Vault: holds collateral/principal via SAC, mints/claims fUSDC, tracks positions with maturity timestamps, over-collateralization factors, liquidation threshold, reentrancy guard | open_position(), repay(), claim_maturity(), liquidate(), emergency_pause() |
| **StrategyAdapter** | Deploys idle USDC into a Blend lending pool; tracks pool shares; accrues variable yield | allocate(), withdraw(), total_vaulted() |
| **SAC (USDC)** | Built-in Stellar Asset Contract — SEP-41 TokenInterface, standard events | transfer, transfer_from, balance |

**Inter-contract call graph:**
1. PositionSettlement.deposit_fixed() -> RateVAMM.quote() (get fixed rate) -> SAC.transfer_from() (pull funds).
2. RateVAMM -> OracleHub.get_variable_rate() (mark-to-market) -> rebalances virtual reserves.
3. PositionSettlement.allocate() -> StrategyAdapter -> Blend pool contract (inter-contract into a third-party protocol).
4. Maturity: RateVAMM -> PositionSettlement (redeem) -> SAC.transfer() (payout).

### 5.2 VIMM pricing model

- Let u = borrows / totalAssets (utilization).
- base_rate = idle_rate + slope * u from the variable pool (Blend's own model).
- Fixed APY quoted via a constant-product virtual curve:
  fixed_apy = base_rate * (x_fixed / (x_fixed - d)) where reserves shift on each trade.
- On each mark-to-market, d_fixed adjusts so the pool stays delta-neutral against the variable rate feed.
- Property tests assert: (a) no free lunch (arb round-trips can't profit), (b) monotonicity of rate vs utilization, (c) solvency invariant totalAssets >= totalLiabilities + accruedInterest.

### 5.3 Token fUSDC (fixed-yield claim)
- Minted 1:1 on deposit; represents principal + accrued fixed interest.
- Custom contract token built with soroban-token-sdk (SEP-41 metadata), minted by RateVAMM on maturity settlement — mirrors the ERC-4626 vault share pattern (DeFindex vaults / Blend pool tokens).

### 5.4 Storage design
- **Persistent:** positions Map<u64, Position>, virtual reserves, pool config, Blend share ledger.
- **Temporary:** transient per-call state, quote nonces.
- **Instance:** admin, allowlisted oracle/strategy/token addresses, protocol fee, term length, liquidation factors.
- **TTL:** explicit bump calls on hot keys; script to extend TTL (Protocol 24 practice).

### 5.5 Event schema

| Event | Data |
|---|---|
| fixed_quote | term, amount, quoted_apy, util, block |
| deposit_fixed | position_id, user, amount, apy, maturity_ts |
| borrow_fixed | position_id, borrower, amount, apy, maturity_ts, collateral |
| variable_rate_sync | pool_id, rate, round |
| allocated | amount, strategy_id, share |
| maturity_claimed | position_id, payout |
| liquidation | position_id, collateral_seized, reason |
| upgraded | wasm_hash, version (SEP-49) |

Frontend subscribes via getEvents + SSE relay; mobile-responsive cards update live with loading/error/skeleton states.

## 6. Frontend (mobile-responsive, Vercel/Netlify)

- **Stack (confirmed):** Next.js + TypeScript + @stellar/stellar-sdk v16 + stellar-wallets-kit (Freighter + Albedo etc.)
- **Design tool:** impeccable CLI/skill for design quality (audit/critique/polish) — runs in CI via `impeccable detect`.
- **Pages:** Market (live rate card, utilization gauge), Deposit/Borrow wizards (quote-first flow), Positions dashboard (maturity countdown, P&L), Liquidations, Protocol health.
- **States:** every mutation -> idle | loading | signing | submitting | success | error; tx-hash linkouts to Stellar Expert; optimistic UI + rollback.
- **Demo-ability:** rate ticker visibly moves when a deposit/borrow lands (event-streamed).

## 7. CI/CD & Deployment Workflow

- **GitHub Actions:** fmt+clippy -> cargo test (unit/integration/property) -> stellar contract build (wasm32v1-none, size check < 64KB, opt-level=z) -> deploy to testnet (pinned stellar-cli version) -> frontend unit tests (Vitest) -> Vercel preview deploy -> impeccable detect on src/.
- **Deploy pipeline (scripts/):** deterministic build -> stellar contract deploy (hash-pinned) -> constructor init -> verify in Stellar Expert -> record tx-hashes in README.
- **Env/secret hygiene:** feeder key and admin keys as GitHub Secrets only; .env.example committed, real .env never.

## 8. Testing Strategy (target 25+)

1. Unit (Rust testutils): rate math, solvency invariants, quote monotonicity, liquidation thresholds, TTL bump, upgrade guard (SEP-49).
2. Property-based (proptest): fixed-point interest accrual round-trips, no-arbitrage bound on VIMM.
3. Integration (multi-contract): register OracleHub+RateVAMM+Settlement+SAC together; deposit->maturity->claim, borrow->repay, forced liquidation; negative tests (unauthorized, stale oracle, insufficient collateral).
4. Fuzz: deposit/borrow/liquidation sequences for invariant violations.
5. Frontend (Vitest + Testing Library): quote widget, error/loading states, event-stream rendering.

## 9. Level 3 Submission Checklist Mapping

| Requirement | How satisfied |
|---|---|
| Advanced smart contracts | VIMM math + multi-contract protocol (4 contracts) |
| Inter-contract communication | Settlement<->VAMM<->OracleHub<->StrategyAdapter<->Blend<->SAC |
| Event streaming & real-time | Full event schema + getEvents frontend sync |
| CI/CD pipeline | GitHub Actions build->test->deploy->frontend |
| Contract deployment workflow | Scripted, hash-pinned, verified tx-hashes |
| Mobile-responsive frontend | Responsive market/positions UI |
| Error & loading states | Explicit state machine per mutation |
| Tests (contract + frontend) | 25+ tests incl. property/fuzz/integration |
| Production architecture | SEP-49 upgrade, TTL mgmt, allowlists, reentrancy guard, emergency pause |
| Docs & demo | Full README, architecture doc, 1-2 min video |

## 10. Roadmap (Levels 3 -> 7)

- **L3:** single-pool USDC/30-day VIMM + fixed quotes, fUSDC, testnet, CI/CD, tests.
- **L4 (MVP+10 users):** multi-term (7/30/90d), borrow side with collateral factors, mobile PWA.
- **L5 (50 users):** Blend integration toggle + variable-vs-fixed arbitrage UI, feedback loop, pitch.
- **L6 (Mainnet):** real USDC SAC, audit (Veridise/Soroban Audit Bank), mainnet launch, 20+ users.
- **L7 (Master/Startup):** SCF/InstaAward pitch — "fixed-income layer on Stellar".

## 11. Risks & Mitigations

- Oracle manipulation: Reflector SEP-40 + staleness + price-sanity + oracle allowlist.
- Reentrancy/atomicity: single-entry mutators, reentrancy guard; use Stellar Router SDK for multi-step atomic flows.
- WASM size: modular contract split; opt-level=z + LTO, 64KB budget check in CI.
- Scope creep: MVP hard-scoped to one term / one asset / one strategy; multi-term is L4.

## 12. Resolved Decisions

| Decision | Choice |
|---|---|
| Frontend framework | Next.js + TypeScript |
| Oracle source | Reflector SEP-40 Pulse |
| Yield source | Blend lending pool |
| fUSDC token | Yes, mintable SEP-41 contract token |
| Product name | Revse |
