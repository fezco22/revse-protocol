<div align="center">

# Revse

**Fixed-rate lending market on Stellar.**

Lock a fixed APY on your USDC for a fixed term, priced by an on-chain virtual
AMM. Deposit, borrow, repay, claim, and swap XLM to USDC, all real on the
Stellar testnet with one wallet signature per action.

Next.js 16 · React 19 · TypeScript · Soroban (Rust) · Stellar Testnet

</div>

---

## Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Live demo](#live-demo)
4. [Deployed contracts](#deployed-contracts-stellar-testnet)
5. [On-chain activity](#on-chain-activity)
6. [How it works](#how-it-works)
7. [Architecture](#architecture)
8. [Tech stack](#tech-stack)
9. [Project structure](#project-structure)
10. [Run locally](#run-locally)
11. [Deploy](#deploy)
12. [Testing and CI](#testing-and-ci)
13. [Configuration](#configuration)
14. [Roadmap](#roadmap)
15. [Disclaimer](#disclaimer)

---

## Overview

Lending rates on Stellar float and reprice every ledger, roughly every 5
seconds, so depositors and borrowers cannot predict their cash flow. Revse turns
that uncertainty into a single number you keep for the whole term. A depositor
locks a fixed APY quoted live by an on-chain virtual AMM, receives an fUSDC
receipt, and claims principal plus interest at maturity. A borrower posts USDC
collateral and borrows at a fixed cost.

This repository is the Level 4 (Green Belt) submission for the Stellar Journey to
Mastery program: a production-ready MVP with real on-chain flows on testnet.

## Features

| Feature | What it does |
|---|---|
| Fixed-rate deposit | Lock a fixed APY on USDC for a 30 day term, priced by RateVAMM |
| Fixed-rate borrow | Post USDC collateral, borrow at a fixed rate, repay principal only |
| Repay and claim | Settle a loan or claim principal plus interest at maturity |
| In-app swap | Convert XLM to USDC through the native Stellar DEX, one signature |
| Simulate | Project outcomes against your real Stellar balances |
| Dashboard | Positions, portfolio stats, and live protocol health in one place |
| Wallets | Freighter and Albedo, with session persistence |

Every mutation has explicit loading, signing, confirming, success, and error
states, and waits for on-chain confirmation before reading new state back.

## Live demo

- Demo video: [Watch the walkthrough](https://drive.google.com/file/d/1Rl5NJkTeATH4tssSN0-FPi9U7azU69gU/view?usp=sharing)
- App: `TODO: add Vercel URL after deploy`
- Network: Stellar Testnet. Connect Freighter (set to Testnet), get test USDC
  from the in-app faucet link, add the USDC trustline, then deposit.

## Deployed contracts (Stellar Testnet)

| Contract | Address |
|---|---|
| PositionSettlement | `CAT6GJUGH4QICPWYB4AMVNKKE6KXMYH7FT4ZELSSWXX34E6TRV7VAZTI` |
| RateVAMM | `CCU45TFE7U2HF7EN6MPPS4JDR5FHCT6FJBUGMP3V6MVPFNYDOJNEBNS3` |
| OracleHub | `CABZUUX5QZ677NR2N6XVZY3RF76CRFAV7HLHMFNHS5HCD5MBLNOO6ZUT` |
| StrategyAdapter | `CDNQHVNS2KIXLIAW2C2VGHQOGJKORVOAZUL3QR4J72G5WFHHC7XSKG5S` |
| fUSDC | `CDHYA7EMHF4JOXRLJWT627EFQMPU5LM663IKCGYEIKI2EE2QWFNOVL7B` |
| MockPool | `CCVSBTACL4E7RHZKENSCR2NZ6WKUOJZB7VUCZMOC3VWC3GHZQRKBQWVY` |
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Open any address on [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet).

## On-chain activity

**11 distinct wallets** have interacted with the contracts (10 end-users + 1 admin),
across 10 deposits, 4 fixed-rate borrows, and 14 vAMM quotes.

See [ONCHAIN-WALLETS.md](ONCHAIN-WALLETS.md) for the full per-wallet breakdown and
what each wallet did (deposit / borrow / oracle update). Snapshot: 2026-08-31.

## How it works

**Deposit is one signed transaction.** PositionSettlement pulls USDC using the
SAC `transfer` (the user authorizes it inside the same signature), calls RateVAMM
to lock the rate, mints fUSDC, and stores the position. The UI polls for
confirmation, then reads the new position from the settlement contract.

**The fixed rate is priced on-chain.** RateVAMM computes
`base = idle_rate + slope * utilization`, clamps it to a configured band, then
applies a constant-product marginal curve per trade. Property tests assert no
free lunch, rate monotonicity, and pool solvency.

**Swap uses the native DEX.** XLM to USDC runs through a Stellar path payment,
quoted live from Horizon, with a one-time USDC trustline step.

## Architecture

```
Frontend (Next.js)                    Soroban contracts (Rust)
------------------                    ------------------------
Wallet: Freighter / Albedo            OracleHub           variable-rate and price feeds
Reads:  Soroban RPC (state, quote)    RateVAMM            prices fixed APY from utilization
        Horizon (balances, DEX)       PositionSettlement  vault, positions, claim, repay
Writes: signed tx -> RPC              StrategyAdapter     idle-fund deployment
Swap:   path payment -> Horizon       fUSDC               SEP-41 receipt token
                                      MockPool            stand-in lending pool
```

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, three.js for
  the hero and ambient backdrops, `@stellar/stellar-sdk` v16.
- **Contracts:** Rust, `soroban-sdk`, built for `wasm32v1-none` and size gated
  under 64 KB.
- **Monitoring and analytics:** Vercel Analytics, Vercel Speed Insights, and an
  app-wide React error boundary.
- **Tests:** Vitest with React Testing Library on the frontend; Rust unit,
  integration, and property tests on the contracts.
- **CI:** GitHub Actions runs fmt, clippy, contract tests, the wasm size gate,
  and frontend lint, typecheck, test, and build.

## Project structure

```
revse/
├── contracts/           Soroban workspace and deterministic deploy script
│   ├── contracts/       oracle-hub, rate-vamm, position-settlement,
│   │                    strategy-adapter, fusdc, mock-pool
│   ├── common/          shared math (rate scaling, term interest)
│   └── scripts/         testnet deploy, init, and wiring
├── frontend/            Next.js app
│   └── src/
│       ├── app/         routes: landing, market, swap, simulate, borrow, dashboard
│       ├── components/  shell, nav, 3D backdrops, UI atoms, error boundary
│       ├── lib/         chain access (RPC and Horizon), formatting, types
│       └── state/       app context (wallet, pool, positions, mutations)
├── README.md
└── SUBMISSION-L4.md     Level 4 submission idea and status
```

## Run locally

The frontend works against the deployed testnet contracts with no configuration.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Connect Freighter (Testnet), get USDC from the
faucet link, add the trustline, then deposit.

Contracts:

```bash
cd contracts
cargo test --workspace
cargo build --release --target wasm32v1-none \
  -p fusdc -p mock-pool -p oracle-hub -p rate-vamm -p strategy-adapter -p position-settlement
```

## Deploy

### Frontend (Vercel)

1. Push this repository to GitHub.
2. On Vercel, import the repository and set **Root Directory** to `frontend`.
3. Deploy. No environment variables are required: the testnet contract addresses
   are compiled in as defaults. Vercel Analytics and Speed Insights activate
   automatically on the Vercel domain.

### Contracts (fresh testnet)

```bash
cp contracts/scripts/.env.example contracts/.env   # fill admin, token, feed
bash contracts/scripts/deploy-testnet.sh           # build, deploy, init, wire
```

The script deploys all six contracts, initializes them in the integration-tested
order, and records every address and wasm hash to `contracts/deployments.env`.

## Testing and CI

```bash
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

Contracts run `cargo test --workspace` (unit, integration across the full
contract chain, and property tests). GitHub Actions runs the full suite plus the
64 KB wasm size gate on every push and pull request.

## Configuration

All values are optional overrides. Defaults point at the deployed testnet.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_VAMM_CONTRACT` | RateVAMM address |
| `NEXT_PUBLIC_SETTLEMENT_CONTRACT` | PositionSettlement address |
| `NEXT_PUBLIC_USDC_CONTRACT` | USDC SAC address |
| `NEXT_PUBLIC_SOROBAN_RPC` | Soroban RPC URL |
| `NEXT_PUBLIC_HORIZON` | Horizon URL |

## Roadmap

- **MVP (now):** single USDC pool, 30 day term, live on testnet. Deposit,
  borrow, repay, claim, and swap all work end to end.
- **Growth (Level 4 to 5):** onboard real users, collect feedback, add
  multi-term options (7, 30, 90 days).
- **Mainnet (Level 6):** real USDC, security audit, monitoring, mainnet launch.

## Disclaimer

This is a protocol concept build on Stellar testnet. Contracts are unit tested
and size gated. Testnet prices are not real market rates. Audited mainnet
deployments may carry different risk parameters.
