# Revse

**Fixed-rate lending market on Stellar.** Lock a fixed APY on your USDC for a
fixed term, priced by an on-chain virtual AMM. Deposit, borrow, repay, claim,
and swap XLM to USDC, all real on the Stellar testnet with a single wallet
signature per action.

> Stellar Journey to Mastery, Level 4 (Green Belt) submission.

---

## What it does

Lending rates on Stellar float and reprice every ledger (about every 5 seconds),
so depositors and borrowers cannot predict cash flow. Revse turns that
uncertainty into one number you keep for the whole term.

- **Deposit** USDC and lock a fixed APY for 30 days, priced live by the RateVAMM.
- **Borrow** against USDC collateral at a fixed rate (over-collateralized).
- **Repay** and **claim** at maturity.
- **Swap** XLM to USDC in-app through the native Stellar DEX (one signature, no
  external exchange).
- **Simulate** outcomes against your real Stellar balances.
- **Dashboard** with your positions, stats, and live protocol health.

## Live demo

- App: `TODO: add Vercel URL after deploy`
- Network: Stellar Testnet. Get test USDC from the in-app faucet link
  (faucet.circle.com), add the USDC trustline, then deposit.

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

Explore any contract on [Stellar Expert (testnet)](https://stellar.expert/explorer/testnet).

## Architecture

```
Frontend (Next.js)                    Soroban contracts (Rust)
------------------                    ------------------------
Wallet: Freighter / Albedo            OracleHub      variable-rate + price feeds
Reads:  Soroban RPC (state, quote)    RateVAMM       prices fixed APY from utilization
        Horizon (balances, DEX)       PositionSettlement  vault, positions, claim, repay
Writes: signed tx -> RPC              StrategyAdapter     idle-fund deployment
Swap:   path payment -> Horizon       fUSDC          SEP-41 receipt token
                                      MockPool       stand-in lending pool
```

A deposit is one signed transaction: PositionSettlement pulls USDC (SAC
`transfer` with the user's auth), calls RateVAMM to lock the rate, mints fUSDC,
and stores the position. The UI waits for on-chain confirmation before reading
the new state back.

The fixed rate comes from RateVAMM: `base = idle_rate + slope * utilization`,
clamped, then a constant-product marginal curve per trade. Property tests assert
no free lunch, rate monotonicity, and solvency.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, three.js
  (ambient/hero backdrops), `@stellar/stellar-sdk` v16.
- **Contracts:** Rust, `soroban-sdk`, target `wasm32v1-none`, size-gated under
  64 KB.
- **Monitoring/analytics:** Vercel Analytics + Speed Insights, app-wide React
  error boundary.
- **Tests:** Vitest + React Testing Library (frontend), Rust unit, integration,
  and property tests (contracts).
- **CI:** GitHub Actions (fmt, clippy, tests, wasm size gate, frontend
  lint/typecheck/test/build).

## Project structure

```
revse/
├── contracts/           Soroban workspace (6 contracts + common) and deploy script
│   ├── contracts/       oracle-hub, rate-vamm, position-settlement, ...
│   ├── common/          shared math (rate scaling, term interest)
│   └── scripts/         deterministic testnet deploy + wiring
├── frontend/            Next.js app
│   └── src/
│       ├── app/         routes: landing, market, swap, simulate, borrow, dashboard
│       ├── components/  Shell, nav, 3D backdrops, UI atoms, error boundary
│       ├── lib/         chain access (RPC + Horizon), formatting, types
│       └── state/       app context (wallet, pool, positions, mutations)
├── README.md
└── SUBMISSION-L4.md     Level 4 submission idea + status
```

## Run locally

Frontend (works against the deployed testnet contracts out of the box):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Connect Freighter (set to Testnet), get USDC from
the faucet link, add the trustline, then deposit.

Checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Contracts:

```bash
cd contracts
cargo test --workspace
cargo build --release --target wasm32v1-none \
  -p fusdc -p mock-pool -p oracle-hub -p rate-vamm -p strategy-adapter -p position-settlement
```

Deploy to a fresh testnet (see `contracts/scripts/deploy-testnet.sh`):

```bash
cp contracts/scripts/.env.example contracts/.env   # fill admin + token + feed
bash contracts/scripts/deploy-testnet.sh
```

## Deploy the frontend (Vercel)

1. Push this repo to GitHub.
2. On Vercel, import the repo and set **Root Directory** to `frontend`.
3. Deploy. No environment variables are required: the testnet contract
   addresses are compiled in as defaults (override with `NEXT_PUBLIC_*` env
   vars to point at a different deployment).

## Configuration (optional overrides)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_VAMM_CONTRACT` | RateVAMM address |
| `NEXT_PUBLIC_SETTLEMENT_CONTRACT` | PositionSettlement address |
| `NEXT_PUBLIC_USDC_CONTRACT` | USDC SAC address |
| `NEXT_PUBLIC_SOROBAN_RPC` | Soroban RPC URL |
| `NEXT_PUBLIC_HORIZON` | Horizon URL |

## Status

Level 4 target: production-ready MVP on testnet with real on-chain flows. See
[SUBMISSION-L4.md](./SUBMISSION-L4.md).
