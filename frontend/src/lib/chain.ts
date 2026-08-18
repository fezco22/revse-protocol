import {
  Contract,
  Address,
  Account,
  Asset,
  Operation,
  xdr,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  nativeToScVal,
  scValToNative,
  Horizon,
} from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import type { PoolState, Position, FxEvent } from "./types";

/** Circle testnet USDC classic asset issuer (the SAC wraps this asset). */
export const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function usdcAsset(): Asset {
  return new Asset("USDC", USDC_ISSUER);
}

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON ?? "https://horizon-testnet.stellar.org";

export interface StellarBalance {
  /** display code, e.g. "XLM", "USDC" */
  code: string;
  /** issuer address for non-native assets */
  issuer?: string;
  /** human balance (already divided out of stroops) */
  balance: number;
  native: boolean;
}

/**
 * Read an account's balances straight from Horizon. Works for any funded
 * Stellar account regardless of whether the protocol contracts are deployed,
 * so the Simulate page can price against real holdings. Returns [] for an
 * unfunded / non-existent account (e.g. the all-zeros demo stub).
 */
export async function fetchStellarBalances(
  address: string
): Promise<StellarBalance[]> {
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const acct = await server.loadAccount(address);
    return acct.balances
      .map((b): StellarBalance | null => {
        if (b.asset_type === "native") {
          return { code: "XLM", balance: Number(b.balance), native: true };
        }
        if (
          b.asset_type === "credit_alphanum4" ||
          b.asset_type === "credit_alphanum12"
        ) {
          return {
            code: b.asset_code ?? "?",
            issuer: b.asset_issuer,
            balance: Number(b.balance),
            native: false,
          };
        }
        return null;
      })
      .filter((b): b is StellarBalance => b !== null)
      .sort((a, b) => b.balance - a.balance);
  } catch {
    // 404 (account not found) or network error: no on-chain holdings to show.
    return [];
  }
}

/**
 * Revse chain access.
 *
 * Configured via env (NEXT_PUBLIC_VAMM_CONTRACT, NEXT_PUBLIC_SETTLEMENT_CONTRACT,
 * NEXT_PUBLIC_SOROBAN_RPC). When the addresses are missing the app runs in
 * DEMO MODE on the in-browser `demo` source, so the full flows are always
 * presentable and the live wiring is drop-in.
 *
 * Units are the protocol natives: amounts = i128 micro-units (USDC has 7
 * decimals), rates + utilization = RATE_SCALE 1e9.
 */

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC ?? "https://soroban-testnet.stellar.org";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE ??
  Networks.TESTNET;

// Deployed Revse testnet contracts. Env vars override these, but the defaults
// make a fresh deployment (e.g. Vercel) work on-chain with zero configuration.
const VAMM_ID =
  process.env.NEXT_PUBLIC_VAMM_CONTRACT ??
  "CCU45TFE7U2HF7EN6MPPS4JDR5FHCT6FJBUGMP3V6MVPFNYDOJNEBNS3";
const SETTLEMENT_ID =
  process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT ??
  "CAT6GJUGH4QICPWYB4AMVNKKE6KXMYH7FT4ZELSSWXX34E6TRV7VAZTI";

/** Circle testnet USDC (SEP-41 SAC): the deposit asset. */
export const USDC_CONTRACT =
  process.env.NEXT_PUBLIC_USDC_CONTRACT ??
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

export function isLive(): boolean {
  return Boolean(VAMM_ID && SETTLEMENT_ID);
}

const STUB =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Simulate a read-only view call against the RPC endpoint and return the raw
 * ScVal result. The guest account is the standard all-zeros test stub; a
 * read-only simulate does not require a funded account.
 */
async function view(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<xdr.ScVal> {
  const srv = new Server(RPC_URL);
  const op = new Contract(contractId).call(method, ...args);
  const source = new Account(STUB, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(op)
    .build();
  const sim = await srv.simulateTransaction(tx);
  const hasRetval = "result" in sim && Boolean((sim as { result?: { retval?: xdr.ScVal } }).result?.retval);
  if (!hasRetval) {
    throw new Error(
      `simulate ${method} failed: ${
        "error" in sim ? (sim as { error: string }).error : "unknown"
      }`
    );
  }
  const rv = (sim as { result: { retval: xdr.ScVal } }).result.retval;
  return rv;
}

interface RawQuote {
  apy: bigint;
  utilization: bigint;
  x_fixed: bigint;
  y_variable: bigint;
  ts: bigint;
}

export async function fetchPoolState(): Promise<PoolState> {
  if (!isLive()) throw new Error("chain not configured");
  // state() -> QuoteInfo (apy, utilization, ts). USDC figures come from the
  // real ledgers total_fixed()/total_vaulted(); x_fixed/y_variable are the
  // virtual curve reserves, not money, so they are not shown as balances.
  const [stateRv, fixedRv, vaultRv] = await Promise.all([
    view(VAMM_ID, "state"),
    view(VAMM_ID, "total_fixed"),
    view(VAMM_ID, "total_vaulted"),
  ]);
  const q = scValToNative(stateRv) as RawQuote;
  const totalFixed = Number(scValToNative(fixedRv) as bigint);
  const totalVaulted = Number(scValToNative(vaultRv) as bigint);
  return {
    apyRate: Number(q.apy),
    utilization: Number(q.utilization),
    fixedUnits: totalFixed,
    variableUnits: totalVaulted,
    tvlUnits: totalFixed + totalVaulted,
    updatedAt: Number(q.ts) * 1000,
  };
}

export async function fetchQuote(
  termSeconds: number,
  amountUnits: number
): Promise<{ apyRate: number; interestUnits: number; maturityTs: number }> {
  if (!isLive()) throw new Error("chain not configured");
  const rv = await view(VAMM_ID, "quote", [
    xdr.ScVal.scvU64(xdr.Uint64.fromString(String(termSeconds))),
    nativeToScVal(BigInt(Math.round(amountUnits)), { type: "i128" }),
  ]);
  const q = scValToNative(rv) as RawQuote;
  const apy = Number(q.apy);
  const now = Math.floor(Date.now() / 1000);
  return {
    apyRate: apy,
    interestUnits: Math.round(
      (amountUnits * apy * termSeconds) / 1e9 / 31_557_600
    ),
    maturityTs: now + termSeconds,
  };
}

interface RawPosition {
  id: bigint;
  user: string;
  side: unknown;
  amount: bigint;
  apy: bigint;
  open_ts: bigint;
  maturity_ts: bigint;
  collateral: bigint;
  claimed: boolean;
  liquidated: boolean;
}

export async function fetchPositions(user: string): Promise<Position[]> {
  if (!isLive()) throw new Error("chain not configured");
  const idsRv = await view(SETTLEMENT_ID, "positions_of", [
    Address.fromString(user).toScVal(),
  ]);
  const ids = (scValToNative(idsRv) as bigint[]) ?? [];
  const out: Position[] = [];
  for (const id of ids) {
    const pref = await view(SETTLEMENT_ID, "get_position", [
      xdr.ScVal.scvU64(xdr.Uint64.fromString(String(id))),
    ]);
    const p = scValToNative(pref) as RawPosition | null;
    if (!p) continue;
    // The Soroban `Side` enum deserializes inconsistently across SDK paths
    // (string "Deposit", { tag: "Deposit" }, or ["Deposit"]). Match on the
    // serialized form so the side is always classified correctly.
    const isDeposit = JSON.stringify(p.side).includes("Deposit");
    out.push({
      id: Number(p.id),
      user: p.user,
      side: isDeposit ? "deposit" : "borrow",
      amount: Number(p.amount),
      apy: Number(p.apy),
      openTs: Number(p.open_ts),
      maturityTs: Number(p.maturity_ts),
      collateral: Number(p.collateral),
      claimed: Boolean(p.claimed),
      liquidated: Boolean(p.liquidated),
    });
  }
  return out;
}

/** Signs an XDR transaction envelope and returns the signed XDR. */
export type TxSigner = (xdrBase64: string) => Promise<string>;

type MutName = "deposit_fixed" | "borrow_fixed" | "claim_maturity" | "repay";

/**
 * Build + simulate (attach auth) + sign + send a settlement write and return
 * the transaction hash. The caller supplies `sign` from the connected wallet.
 */
export async function submitCall(
  method: MutName,
  args: xdr.ScVal[],
  source: string,
  sign: TxSigner
): Promise<string> {
  if (!isLive()) throw new Error("chain not configured (demo mode)");
  const srv = new Server(RPC_URL);
  const account = await srv.getAccount(source);
  const op = new Contract(SETTLEMENT_ID).call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: { minTime: 0, maxTime: 0 },
  })
    .addOperation(op)
    .build();
  const prepared = await srv.prepareTransaction(tx);
  const signedXdr = await sign(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await srv.sendTransaction(signed);
  if (res.status === "ERROR") {
    throw new Error(
      `submit rejected: ${JSON.stringify(res.errorResult ?? res.status)}`
    );
  }
  const hash = res.hash;

  // sendTransaction only queues the tx (PENDING). Poll until it is actually
  // applied to a ledger, so callers that read state next see the new position.
  const deadline = Date.now() + 30_000;
  let info = await srv.getTransaction(hash);
  while (info.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    info = await srv.getTransaction(hash);
  }
  if (info.status === "NOT_FOUND") {
    throw new Error("transaction not confirmed in time; check Stellar Expert");
  }
  if (info.status !== "SUCCESS") {
    throw new Error(`transaction failed on-chain (${info.status})`);
  }
  return hash;
}

export async function submitDeposit(
  user: string,
  amountUnits: number,
  sign: TxSigner
): Promise<string> {
  return submitCall(
    "deposit_fixed",
    [
      Address.fromString(user).toScVal(),
      nativeToScVal(BigInt(Math.round(amountUnits)), { type: "i128" }),
    ],
    user,
    sign
  );
}

export async function submitBorrow(
  user: string,
  collateralUnits: number,
  borrowUnits: number,
  sign: TxSigner
): Promise<string> {
  return submitCall(
    "borrow_fixed",
    [
      Address.fromString(user).toScVal(),
      nativeToScVal(BigInt(Math.round(collateralUnits)), { type: "i128" }),
      nativeToScVal(BigInt(Math.round(borrowUnits)), { type: "i128" }),
    ],
    user,
    sign
  );
}

export async function submitClaim(
  user: string,
  positionId: number,
  sign: TxSigner
): Promise<string> {
  return submitCall(
    "claim_maturity",
    [xdr.ScVal.scvU64(xdr.Uint64.fromString(String(positionId)))],
    user,
    sign
  );
}

export async function submitRepay(
  user: string,
  positionId: number,
  sign: TxSigner
): Promise<string> {
  return submitCall(
    "repay",
    [xdr.ScVal.scvU64(xdr.Uint64.fromString(String(positionId)))],
    user,
    sign
  );
}

/**
 * Long-poll for contract events on the settlement contract. Returns an
 * unsubscribe fn. Topics: depositfx, borrowfx, matclaim, repay, liquidate.
 */
export async function streamEvents(
  onEvent: (e: FxEvent) => void
): Promise<() => void> {
  if (!isLive()) return () => {};
  const srv = new Server(RPC_URL);
  let cursor: string | undefined;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await srv.getEvents({
        cursor,
        filters: [
          {
            contractIds: [SETTLEMENT_ID],
            topics: [
              ["depositfx"],
              ["borrowfx"],
              ["matclaim"],
              ["repay"],
              ["liquidate"],
            ],
          },
        ],
      } as never);
      for (const ev of res.events) {
        const sym = ev.topic[0]?.value();
        const name =
          typeof sym === "string"
            ? sym
            : Buffer.isBuffer(sym)
              ? sym.toString()
              : "";
        onEvent({
          name: name as FxEvent["name"],
          ledger: ev.ledger,
          raw: ev.topic.slice(1),
        });
      }
      const last = res.events[res.events.length - 1];
      if (last) cursor = last.ledgerClosedAt ?? String(last.ledger);
    } catch {
      /* transient RPC failure - keep polling */
    }
    if (!stopped) setTimeout(tick, 3000);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
// ---------------- classic DEX swap: XLM -> USDC ----------------

export interface SwapEstimate {
  /** estimated USDC received for the given XLM input */
  out: number;
  /** conversion path (asset hops); empty for a direct pool/orderbook swap */
  path: Asset[];
}

/**
 * Ask Horizon for the best strict-send path converting `xlmAmount` XLM into
 * USDC via the Stellar DEX (order books + AMM pools). Returns null when no
 * path/liquidity exists.
 */
export async function fetchSwapEstimate(
  xlmAmount: number
): Promise<SwapEstimate | null> {
  if (!(xlmAmount > 0)) return null;
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const res = await server
      .strictSendPaths(Asset.native(), xlmAmount.toFixed(7), [usdcAsset()])
      .call();
    const best = res.records[0];
    if (!best) return null;
    const path = (best.path ?? []).map((p) =>
      p.asset_type === "native"
        ? Asset.native()
        : new Asset(p.asset_code as string, p.asset_issuer as string)
    );
    return { out: Number(best.destination_amount), path };
  } catch {
    return null;
  }
}

/** Whether the account already trusts (can hold) Circle testnet USDC. */
export async function hasUsdcTrustline(address: string): Promise<boolean> {
  const bs = await fetchStellarBalances(address);
  return bs.some((b) => b.code === "USDC" && !b.native);
}

/** Add a USDC trustline (required before the account can receive USDC). */
export async function submitAddUsdcTrust(
  source: string,
  sign: TxSigner
): Promise<string> {
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset() }))
    .setTimeout(120)
    .build();
  const signedXdr = await sign(tx.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await server.submitTransaction(signed);
  return res.hash;
}

/**
 * Swap XLM -> USDC in one signed transaction using a path payment (send an
 * exact XLM amount, receive at least `minOut` USDC). Source and destination
 * are the same account.
 */
export async function submitSwapXlmToUsdc(
  source: string,
  xlmAmount: number,
  minOut: number,
  path: Asset[],
  sign: TxSigner
): Promise<string> {
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: xlmAmount.toFixed(7),
        destination: source,
        destAsset: usdcAsset(),
        destMin: minOut.toFixed(7),
        path,
      })
    )
    .setTimeout(120)
    .build();
  const signedXdr = await sign(tx.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await server.submitTransaction(signed);
  return res.hash;
}
