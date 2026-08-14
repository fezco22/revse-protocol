# FixYield — Frontend

Mobile-first fixed-rate savings on Stellar. See `../PRODUCT.md` and
`../PRD-fixyield-vamm.md` for the product and spec.

## Stack

Next.js 16 (App Router) + TypeScript + @stellar/stellar-sdk v16 +
stellar-wallets-kit (Freighter/Albedo). Tested with Vitest + React Testing
Library.

## Development

```sh
npm run dev        # http://localhost:3000
```

Runs in **demo mode** by default: a `DemoSource` mirrors the RateVAMM/Position
contract behavior locally (virtual AMM quotes, a variable rate that wanders, a
seeded portfolio, and deposit/claim/repay mutations) so the UI is fully
explorable without a wallet or testnet.

Set `NEXT_PUBLIC_VAMM_CONTRACT` and `NEXT_PUBLIC_SETTLEMENT_CONTRACT` to switch
to live Soroban RPC (`src/lib/chain.ts`).

## Checks

```sh
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run build      # next build
```

All four run in the `frontend` job of `.github/workflows/ci.yml`.

## Structure

- `src/app/*` — routes: Market (`/`), Deposit, Positions, Health, Borrow.
- `src/components/` — Shell (header + bottom tab bar), WalletButton, UI atoms.
- `src/lib/` — `format.ts` (unit scaling + APY math), `demo.ts` (demo source),
  `chain.ts` (live RPC), `types.ts`.
- `src/state/app.tsx` — AppProvider context: wallet, pool, positions, mutation
  state machine.