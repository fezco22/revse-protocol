# FixYield — Soroban Contracts

Fixed-rate lending market on Stellar: a virtual AMM prices 30-day fixed APY over
a variable-yield pool. See `../PRD-fixyield-vamm.md` for the full spec.

## Contracts

| Contract | WASM | Responsibility |
|---|---|---|
| `fusdc` | 18.6 KB | fUSDC fixed-yield receipt token (SEP-41), minter = settlement |
| `oracle-hub` | 23.8 KB | Variable-rate / price feed registry with reporter allowlist |
| `rate-vamm` | 32.5 KB | Virtual AMM: quotes fixed APY from utilization + var rate |
| `strategy-adapter` | 19.3 KB | Deploys idle USDC into a lending pool, tracks shares |
| `mock-pool` | 17.3 KB | Stand-in Blend/lending pool for tests |
| `position-settlement` | 39.2 KB | Vault: positions, maturity claim, borrow/repay, liquidation |

All WASM sizes are `--release --target wasm32v1-none`, far below the 64 KB budget.

## Workspace

```text
contracts/
├── common/                 shared math (term interest, rate scaling)
├── contracts/*             the six contracts above
├── Cargo.toml              workspace + release profile (opt-level=z, lto)
└── .cargo/config.toml      windows-gnu linker workaround (keep *.wasm builds clean)
```

- Soroban SDK `25`, token SDK `25`, `wasm32v1-none` target.
- Release profile: `opt-level=z`, `lto=true`, `panic=abort` — see `Cargo.toml`.

## Build & test

```sh
rustup target add wasm32v1-none

cargo fmt --all -- --check
cargo clippy --all-targets --workspace -- -D warnings
cargo test --workspace

cargo build --release --target wasm32v1-none -p fusdc -p mock-pool -p oracle-hub \
  -p rate-vamm -p strategy-adapter -p position-settlement
ls target/wasm32v1-none/release/*.wasm
```

52 tests pass (unit + integration over the full contract chain).

## CI (GitHub Actions)

`.github/workflows/ci.yml` on push/PR:

1. **check** job — fmt, clippy (`-D warnings`), workspace tests.
2. **wasm** job — deterministic release build for `wasm32v1-none`, then asserts each
   contract stays under 64 KB.

## Deploy workflow (testnet)

Deterministic deploy + init + wiring is scripted in `scripts/deploy-testnet.sh`.
It mirrors the integration-tested `deploy_chain()` topology exactly:

```sh
cp scripts/.env.example .env    # fill ADMIN_SECRET/ADMIN_ADDR, TOKEN_ADDR, USDC_FEED_ADDR
./scripts/deploy-testnet.sh
```

The script:

1. Builds deterministic WASM (`--release --target wasm32v1-none`).
2. Deploys `position-settlement` first (its id is wired into every other
   contract), then `oracle-hub`, `rate-vamm`, `mock-pool`, `strategy-adapter`,
   `fusdc`.
3. `init`s and wires in the exact order from the integration test: OracleHub →
   RateVAMM (config) → MockPool (admin = strategy) → StrategyAdapter
   (admin = settlement) → fUSDC (minter = settlement) → VAMM `set_settlement` →
   OracleHub reporters + USDC SEP-40 feed → PositionSettlement last.
4. Records every contract id and wasm sha256 to `deployments.env` (hash-pinned
   deploy evidence; gitignored).

The `stellar` CLI must be on PATH, pinned to the SDK 25 line (v25.0.0).
Hash-pinning the CLI is what makes the WASM output reproducible.

Verify each contract on Stellar Expert and record tx hashes in the table below.

### Testnet deployment records

| Contract | Deploy tx hash | Init tx hash | Notes |
|---|---|---|---|
| oracle-hub | _pending_ | _pending_ | |
| rate-vamm | _pending_ | _pending_ | |
| mock-pool | _pending_ | _pending_ | |
| strategy-adapter | _pending_ | _pending_ | |
| fusdc | _pending_ | _pending_ | |
| position-settlement | _pending_ | _pending_ | |

## Env / secrets hygiene

- `.env.example` committed; real `.env` and `*.pem`/`*.secret` are gitignored.
- Feeder and admin secret keys are GitHub Actions Secrets only.