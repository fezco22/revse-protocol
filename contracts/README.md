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

1. Build deterministic WASM (hash-pinned `soroban` CLI pinned to the SDK 25 tag).
2. Deploy each contract with `soroban contract deploy --wasm <file> --source <admin>`.
3. `init` each contract (`oracle-hub` first, then `rate-vamm`, `mock-pool`,
   `strategy-adapter`, `fusdc`, `position-settlement` last — it holds the others'
   addresses).
4. Verify on Stellar Expert and record tx hashes below.
5. Admin/feeder keys live in GitHub Secrets; never committed.

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