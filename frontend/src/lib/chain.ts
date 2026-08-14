import {
  Contract,
  Address,
  Account,
  xdr,
  TransactionBuilder,
  BASE_FEE,
  Networks,
} from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";
import type { PoolState, Position, FxEvent } from "./types";

/**
 * FixYield chain access.
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

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE ??
  Networks.TESTNET;

const VAMM_ID = process.env.NEXT_PUBLIC_VAMM_CONTRACT ?? "";
const SETTLEMENT_ID = process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT ?? "";

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

export async function fetchPoolState(): Promise<PoolState> {
  if (!isLive()) throw new Error("chain not configured (demo mode)");
  // RateVAMM::state() -> Vec(QuoteInfo{apy,utilization,x_fixed,y_variable,ts})
  const rv = await view(VAMM_ID, "state");
  const row = rv.vec()?.[0];
  if (!row) throw new Error("state() returned empty vec");
  const f = row.vec()!;
  return {
    apyRate: Number(f[0]),
    utilization: Number(f[1]),
    tvlUnits: Number(f[2]) + Number(f[3]),
    fixedUnits: Number(f[2]),
    variableUnits: Number(f[3]),
    updatedAt: Number(f[4]) * 1000,
  };
}

export async function fetchPositions(user: string): Promise<Position[]> {
  if (!isLive()) throw new Error("chain not configured (demo mode)");
  const idsRv = await view(SETTLEMENT_ID, "positions_of", [
    Address.fromString(user).toScVal(),
  ]);
  const ids = (idsRv.vec() ?? []).map((v) => Number(v.u64()!.toString()));
  const out: Position[] = [];
  for (const id of ids) {
    const pref = await view(SETTLEMENT_ID, "get_position", [
      xdr.ScVal.scvU64(xdr.Uint64.fromString(String(id))),
    ]);
    const f = pref.vec()!;
    out.push({
      id: Number(f[0]),
      user: f[1].toString(),
      side: Number(f[2]) === 0 ? "deposit" : "borrow",
      amount: Number(f[3]),
      apy: Number(f[4]),
      openTs: Number(f[5]) * 1000,
      maturityTs: Number(f[6]) * 1000,
      collateral: Number(f[7]),
      claimed: Boolean(f[8]),
      liquidated: Boolean(f[9]),
    });
  }
  return out;
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
      /* transient RPC failure — keep polling */
    }
    if (!stopped) setTimeout(tick, 3000);
  };
  void tick();
  return () => {
    stopped = true;
  };
}