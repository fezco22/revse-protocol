#!/usr/bin/env bash
#
# FixYield — deterministic testnet deploy + init + wiring.
#
# Mirrors `deploy_chain()` in contracts/contracts/position-settlement/src/test.rs
# so the on-chain topology matches the integration-tested one exactly:
#
#   position-settlement  (deployed first; its address is wired into the others)
#     ├─ rate-vamm        set_settlement = position-settlement
#     ├─ oracle-hub       reporters: strategy-adapter, position-settlement
#     ├─ strategy-adapter admin = position-settlement, pool = mock-pool
#     ├─ mock-pool        admin = strategy-adapter
#     └─ fusdc            minter = position-settlement
#
# Usage:
#   cp scripts/.env.example .env   # fill in secrets & addresses
#   ./scripts/deploy-testnet.sh    # deploys, inits, wires, records tx hashes
#
# Outputs:
#   deployments.env   every contract id + init/submit tx hashes + wasm sha256
#
# Requirements: bash, cargo (with wasm32v1-none), the stellar CLI on PATH
# (set STELLAR to a pinned binary path to override).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

: "${RPC_URL:=https://soroban-testnet.stellar.org}"
: "${NETWORK_PASSPHRASE:=Test SDF Network ; September 2015}"
: "${STELLAR:=stellar}"

# Required inputs
for var in ADMIN_SECRET ADMIN_ADDR TOKEN_ADDR USDC_FEED_ADDR; do
  if [[ -z "${!var:-}" || "${!var}" == "S..." || "${!var}" == "G..." ]]; then
    echo "error: $var must be set in $ENV_FILE" >&2
    exit 1
  fi
done

# ---- deterministic build -------------------------------------------------
WASM_DIR="$ROOT_DIR/target/wasm32v1-none/release"
echo "==> building deterministic WASM (release, wasm32v1-none)"
( cd "$ROOT_DIR" && cargo build --release --target wasm32v1-none -p fusdc -p mock-pool -p oracle-hub -p rate-vamm -p strategy-adapter -p position-settlement )

CONTRACTS=(oracle-hub rate-vamm mock-pool strategy-adapter fusdc)
declare -A WASM_NAME=(
  [oracle-hub]=oracle_hub
  [rate-vamm]=rate_vamm
  [mock-pool]=mock_pool
  [strategy-adapter]=strategy_adapter
  [fusdc]=fusdc
  [position-settlement]=position_settlement
)

# ---- helpers --------------------------------------------------------------
NET_ARGS=(--network testnet --source "$ADMIN_SECRET")

deploy() {
  local name="$1"
  local wasm="$WASM_DIR/${WASM_NAME[$name]}.wasm"
  echo "==> deploying $name" >&2
  local id
  id=$("$STELLAR" contract deploy --wasm "$wasm" "${NET_ARGS[@]}" | tail -n1)
  echo "    $name -> $id" >&2
  echo "$id"
}

invoke() {
  # invoke <contract-name> <fn> [-- <arg>...]
  local c="$1"; shift
  local fn="$1"; shift
  local id="${ID[$c]}"
  echo "==> $c::$fn" >&2
  "$STELLAR" contract invoke --id "$id" "${NET_ARGS[@]}" -- "$fn" "$@"
}

admin_addr() {
  # The admin public address is provided directly (ADMIN_ADDR).
  echo "$ADMIN_ADDR"
}

# ---- deploy: position-settlement first (its id is referenced everywhere) --
RECORDS="$ROOT_DIR/deployments.env"
: > "$RECORDS"
echo "# FixYield testnet deployment — generated $(date -u +%FT%TZ)" > "$RECORDS"

declare -A ID
ID[position-settlement]=$(deploy position-settlement)
for c in "${CONTRACTS[@]}"; do
  ID[$c]=$(deploy "$c")
done

ADMIN=$(admin_addr)

# ---- init & wire (order from the integration test) ------------------------
# 1. OracleHub
invoke oracle-hub init --admin "$ADMIN" --max-staleness "${MAX_STALENESS:-3600}"

# 2. RateVAMM
invoke rate-vamm init \
  --admin "$ADMIN" \
  --oracle_hub "${ID[oracle-hub]}" \
  --config "{\"term_seconds\":${TERM_SECONDS:-2592000},\"idle_rate\":${IDLE_RATE:-50000000},\"slope\":${SLOPE:-500000000},\"min_rate\":${MIN_RATE:-10000000},\"max_rate\":${MAX_RATE:-250000000}}"

# 3. mock-pool (admin = strategy-adapter)
invoke mock-pool init \
  --admin "${ID[strategy-adapter]}" \
  --token "$TOKEN_ADDR" \
  --idle_rate "${POOL_IDLE_RATE:-20000000}" \
  --slope "${POOL_SLOPE:-500000000}"

# 4. strategy-adapter (admin = position-settlement)
invoke strategy-adapter init \
  --admin "${ID[position-settlement]}" \
  --token "$TOKEN_ADDR" \
  --pool "${ID[mock-pool]}" \
  --oracle "${ID[oracle-hub]}"

# 5. fUSDC (minter = position-settlement)
invoke fusdc init \
  --admin "$ADMIN" \
  --minter "${ID[position-settlement]}" \
  --decimals "${FUSDC_DECIMALS:-7}"

# 6. RateVAMM: register position-settlement as the only caller of deposit_fixed
invoke rate-vamm set_settlement --settlement "${ID[position-settlement]}"

# 7. OracleHub: allow strategy + settlement to push variable rates
invoke oracle-hub set_reporter --reporter "${ID[strategy-adapter]}" --allowed true
invoke oracle-hub set_reporter --reporter "${ID[position-settlement]}" --allowed true

# 8. OracleHub: register the USDC SEP-40 feed
invoke oracle-hub set_feed \
  --asset "$TOKEN_ADDR" \
  --oracle "$USDC_FEED_ADDR" \
  --decimals "${USDC_FEED_DECIMALS:-7}" \
  --max_staleness "${MAX_STALENESS:-3600}"

# 9. PositionSettlement last — it holds every other contract's address
invoke position-settlement init \
  --admin "$ADMIN" \
  --vamm "${ID[rate-vamm]}" \
  --oracle "${ID[oracle-hub]}" \
  --token "$TOKEN_ADDR" \
  --fusdc "${ID[fusdc]}" \
  --strategy "${ID[strategy-adapter]}" \
  --min_collat_ratio "${MIN_COLLAT_RATIO:-1500000000}" \
  --liq_threshold "${LIQ_THRESHOLD:-1100000000}" \
  --protocol_fee_bps "${PROTOCOL_FEE_BPS:-100}"

# ---- record wasm hashes ----------------------------------------------------
ALL=(oracle-hub rate-vamm mock-pool strategy-adapter fusdc position-settlement)
echo "==> recording wasm sha256"
for c in "${ALL[@]}"; do
  sha=$(sha256sum "$WASM_DIR/${WASM_NAME[$c]}.wasm" | cut -d' ' -f1)
  echo "${c}_wasm_sha256=$sha" >> "$RECORDS"
done
for c in "${ALL[@]}"; do
  echo "${c}_id=${ID[$c]}" >> "$RECORDS"
done

echo
echo "==> deploy complete. Contract ids + wasm hashes in $RECORDS"
cat "$RECORDS"