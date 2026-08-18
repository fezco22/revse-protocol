"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Asset } from "@stellar/stellar-sdk";
import { RATE_SCALE, TERM_DAYS, TERM_SECONDS, termInterest } from "@/lib/format";
import {
  fetchPoolState,
  fetchPositions,
  fetchStellarBalances,
  isLive,
  NETWORK_PASSPHRASE,
  submitDeposit,
  submitBorrow,
  submitClaim,
  submitRepay,
  submitAddUsdcTrust,
  submitSwapXlmToUsdc,
  streamEvents,
  type TxSigner,
} from "@/lib/chain";
import type { MutStage, PoolState, Position, Quote, UiEvent } from "@/lib/types";

export const TERM_DAYS_SHOWN = TERM_DAYS;

type WalletKind = "freighter" | "albedo";

interface WalletState {
  connected: boolean;
  address: string | null;
  connecting: boolean;
  connect: (wallet: WalletKind) => Promise<void>;
  disconnect: () => void;
}

interface AppState {
  wallet: WalletState;
  pool: PoolState | null;
  positions: Position[];
  events: UiEvent[];
  live: boolean;
  connectedWallet: WalletKind | null;
  /** true once the client has attempted to restore a persisted session */
  booted: boolean;
  /** connected wallet's on-chain USDC balance, micro-units (0 until fetched) */
  balance: number;
  quoteFor: (amountUnits: number) => Quote;
  mutateDeposit: (amountUnits: number) => Promise<Position>;
  mutateBorrow: (collateralUnits: number, borrowUnits: number) => Promise<Position>;
  mutateClaim: (id: number) => Promise<void>;
  mutateRepay: (id: number) => Promise<void>;
  addUsdcTrust: () => Promise<void>;
  swapXlmToUsdc: (amountXlm: number, minOut: number, path: Asset[]) => Promise<void>;
  refreshBalance: () => void;
  mutStage: MutStage;
  mutError: string | null;
}

const Ctx = createContext<AppState | null>(null);

const SESSION_KEY = "revse.session";

/** A client-side rate estimate from the live pool APY. The exact rate is
 *  quoted and locked on-chain at deposit; this drives the preview numbers. */
function estimateQuote(amountUnits: number, apyRate: number): Quote {
  const interest = termInterest(amountUnits, apyRate, TERM_SECONDS);
  return {
    apyRate,
    utilization: 0,
    interestUnits: Math.round(interest),
    maturityTs: Math.floor(Date.now() / 1000) + TERM_SECONDS,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [connectedWallet, setConnectedWallet] = useState<WalletKind | null>(
    null
  );
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [mutStage, setMutStage] = useState<MutStage>("idle");
  const [mutError, setMutError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [booted, setBooted] = useState(false);

  const live = isLive();

  // Restore a persisted wallet session after mount (no work during render, so
  // no cascading renders and no SSR hydration mismatch).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            kind: WalletKind;
            address: string;
          };
          if (saved?.address && saved?.kind) {
            setAddress(saved.address);
            setConnectedWallet(saved.kind);
          }
        }
      } catch {
        /* corrupt/unavailable storage - start disconnected */
      }
      setBooted(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Poll global pool state from the RateVAMM, and stream settlement events.
  useEffect(() => {
    let cancelled = false;
    const refreshPool = () =>
      fetchPoolState()
        .then((p) => {
          if (!cancelled) setPool(p);
        })
        .catch(() => {});
    refreshPool();
    const pid = setInterval(refreshPool, 5000);

    let cancelEvents: () => void = () => {};
    void streamEvents((e) => {
      setEvents((prev) =>
        [
          { name: e.name, ts: Math.floor(Date.now() / 1000), ledger: e.ledger },
          ...prev,
        ].slice(0, 6)
      );
      refreshPool();
    }).then((unsub) => {
      cancelEvents = unsub;
    });

    return () => {
      cancelled = true;
      clearInterval(pid);
      cancelEvents();
    };
  }, []);

  // Per-account data: positions + USDC balance, refreshed on connect.
  const refreshPositions = useCallback((addr: string) => {
    fetchPositions(addr)
      .then(setPositions)
      .catch(() => {});
  }, []);

  const refreshBalance = useCallback(() => {
    if (!address) {
      setBalance(0);
      return;
    }
    fetchStellarBalances(address)
      .then((bs) => {
        const usdc = bs.find((b) => b.code === "USDC");
        setBalance(usdc ? Math.round(usdc.balance * 10_000_000) : 0);
      })
      .catch(() => setBalance(0));
  }, [address]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!address) {
        setPositions([]);
        setBalance(0);
        return;
      }
      refreshPositions(address);
      refreshBalance();
    }, 0);
    const id = address
      ? setInterval(() => refreshPositions(address), 8000)
      : undefined;
    return () => {
      clearTimeout(t);
      if (id) clearInterval(id);
    };
  }, [address, refreshPositions, refreshBalance]);

  const connect = useCallback(async (kind: WalletKind) => {
    setConnecting(true);
    setMutError(null);
    try {
      let resolved: string;
      if (kind === "freighter") {
        const flex = await import("@stellar/freighter-api");
        const conn = await flex.isConnected();
        if (!conn?.isConnected) {
          throw new Error(
            "Freighter not detected. Install the extension and reload."
          );
        }
        // requestAccess() opens the Freighter popup and returns the address
        // once approved; getAddress() never prompts, so it can't connect.
        const res = await flex.requestAccess();
        if (res.error) {
          throw new Error(res.error.message ?? "Freighter access denied");
        }
        if (!res.address) throw new Error("Freighter returned no address");
        resolved = res.address;
        setAddress(res.address);
      } else {
        const albedoMod = await import("@albedo-link/intent");
        const albedo = (
          albedoMod as unknown as {
            default: { publicKey(p: { token: string }): Promise<{ pubkey: string }> };
          }
        ).default;
        const res = await albedo.publicKey({ token: String(Date.now()) });
        if (!res?.pubkey) throw new Error("Albedo returned no address");
        resolved = res.pubkey;
        setAddress(res.pubkey);
      }
      setConnectedWallet(kind);
      try {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ kind, address: resolved })
        );
      } catch {
        /* storage unavailable - session just won't persist across reload */
      }
    } catch (err) {
      setMutError(err instanceof Error ? err.message : "connect failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setConnectedWallet(null);
    setPositions([]);
    setBalance(0);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /** Build a wallet signer for the connected wallet, or null when no wallet. */
  const signerFor = useCallback(async (): Promise<TxSigner | null> => {
    if (!address || !connectedWallet) return null;
    if (connectedWallet === "freighter") {
      const flex = await import("@stellar/freighter-api");
      return async (xdrBase64: string) => {
        const res = await flex.signTransaction(xdrBase64, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address,
        });
        if (!res?.signedTxXdr) {
          throw new Error(res?.error?.message ?? "signing failed");
        }
        return res.signedTxXdr;
      };
    }
    const albedoMod = await import("@albedo-link/intent");
    const albedo = (
      albedoMod as unknown as {
        default: {
          tx(p: {
            xdr: string;
            network: string;
            pubkey: string;
          }): Promise<{ signed_envelope_xdr: string }>;
        };
      }
    ).default;
    return async (xdrBase64: string) => {
      const res = await albedo.tx({
        xdr: xdrBase64,
        network: "testnet",
        pubkey: address,
      });
      if (!res?.signed_envelope_xdr) throw new Error("signing failed");
      return res.signed_envelope_xdr;
    };
  }, [address, connectedWallet]);

  // Mutation stage machine tied to the real signing + submit lifecycle.
  const runMutation = useCallback(
    async <T,>(fn: (signer: TxSigner, addr: string) => Promise<T>): Promise<T> => {
      const signer = await signerFor();
      if (!signer || !address) {
        setMutStage("error");
        setMutError("Connect a wallet to sign this transaction.");
        throw new Error("no wallet");
      }
      setMutStage("awaiting-sign");
      setMutError(null);
      try {
        const result = await fn(signer, address);
        setMutStage("confirming");
        setMutStage("done");
        setTimeout(() => setMutStage("idle"), 1600);
        return result;
      } catch (err) {
        setMutStage("error");
        setMutError(err instanceof Error ? err.message : "transaction failed");
        throw err;
      }
    },
    [signerFor, address]
  );

  const mutateDeposit = useCallback(
    async (amountUnits: number) => {
      return runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitDeposit(addr, amountUnits, signer);
        const next = await fetchPositions(addr);
        setPositions(next);
        refreshBalance();
        const created = next[next.length - 1];
        if (!created) throw new Error("deposit did not produce a position");
        return created;
      });
    },
    [runMutation, refreshBalance]
  );

  const mutateBorrow = useCallback(
    async (collateralUnits: number, borrowUnits: number) => {
      return runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitBorrow(addr, collateralUnits, borrowUnits, signer);
        const next = await fetchPositions(addr);
        setPositions(next);
        refreshBalance();
        const created = next[next.length - 1];
        if (!created) throw new Error("borrow did not produce a position");
        return created;
      });
    },
    [runMutation, refreshBalance]
  );

  const mutateClaim = useCallback(
    async (id: number) => {
      await runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitClaim(addr, id, signer);
        setPositions(await fetchPositions(addr));
        refreshBalance();
      });
    },
    [runMutation, refreshBalance]
  );

  const mutateRepay = useCallback(
    async (id: number) => {
      await runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitRepay(addr, id, signer);
        setPositions(await fetchPositions(addr));
        refreshBalance();
      });
    },
    [runMutation, refreshBalance]
  );

  const addUsdcTrust = useCallback(
    async () => {
      await runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitAddUsdcTrust(addr, signer);
        refreshBalance();
      });
    },
    [runMutation, refreshBalance]
  );

  const swapXlmToUsdc = useCallback(
    async (amountXlm: number, minOut: number, path: Asset[]) => {
      await runMutation(async (signer, addr) => {
        setMutStage("signing");
        await submitSwapXlmToUsdc(addr, amountXlm, minOut, path, signer);
        refreshBalance();
      });
    },
    [runMutation, refreshBalance]
  );

  const quoteFor = useCallback(
    (amountUnits: number) => estimateQuote(amountUnits, pool?.apyRate ?? 0),
    [pool]
  );

  const wallet: WalletState = useMemo(
    () => ({
      connected: Boolean(address),
      address,
      connecting,
      connect,
      disconnect,
    }),
    [address, connecting, connect, disconnect]
  );

  const value = useMemo<AppState>(
    () => ({
      wallet,
      pool,
      positions,
      events,
      live,
      connectedWallet,
      booted,
      balance,
      quoteFor,
      mutateDeposit,
      mutateBorrow,
      mutateClaim,
      mutateRepay,
      addUsdcTrust,
      swapXlmToUsdc,
      refreshBalance,
      mutStage,
      mutError,
    }),
    [
      wallet,
      pool,
      positions,
      events,
      live,
      connectedWallet,
      booted,
      balance,
      quoteFor,
      mutateDeposit,
      mutateBorrow,
      mutateClaim,
      mutateRepay,
      addUsdcTrust,
      swapXlmToUsdc,
      refreshBalance,
      mutStage,
      mutError,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function bpsFromRate(rate: number): number {
  return (rate / RATE_SCALE) * 10_000;
}
