"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DemoEvent } from "@/lib/demo";
import { RATE_SCALE, TERM_DAYS, termInterest } from "@/lib/format";
import { demo, TERM_SECONDS } from "@/lib/demo";
import {
  fetchPoolState,
  fetchPositions,
  isLive,
} from "@/lib/chain";
import type { MutStage, PoolState, Position, Quote } from "@/lib/types";
import { DEMO_USER_ADDR } from "@/lib/types";

export const TERM_DAYS_SHOWN = TERM_DAYS;

interface WalletState {
  connected: boolean;
  address: string | null;
  connecting: boolean;
  connect: (wallet: "freighter" | "albedo") => Promise<void>;
  disconnect: () => void;
}

interface AppState {
  wallet: WalletState;
  pool: PoolState | null;
  positions: Position[];
  events: DemoEvent[];
  live: boolean;
  connectedWallet: "freighter" | "albedo" | null;
  /** current wallet USDC balance in micro-units (demo: seeded) */
  balance: number;
  quoteFor: (amountUnits: number) => Quote;
  mutateDeposit: (amountUnits: number) => Promise<Position>;
  mutateClaim: (id: number) => Promise<void>;
  mutateRepay: (id: number) => Promise<void>;
  mutStage: MutStage;
  mutError: string | null;
}

const Ctx = createContext<AppState | null>(null);

function allocateQuote(amountUnits: number): Quote {
  const s = demo().state();
  const base = s.apyRate;
  const interest = termInterest(amountUnits, base, TERM_SECONDS);
  return {
    apyRate: base,
    utilization: s.utilization,
    interestUnits: Math.round(interest),
    maturityTs: Math.floor(Date.now() / 1000) + TERM_SECONDS,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [connectedWallet, setConnectedWallet] = useState<
    "freighter" | "albedo" | null
  >(null);
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolState | null>(() =>
    isLive() ? null : demo().state()
  );
  const [positions, setPositions] = useState<Position[]>(() =>
    isLive() ? [] : demo().positionsOf(DEMO_USER_ADDR)
  );
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [mutStage, setMutStage] = useState<MutStage>("idle");
  const [mutError, setMutError] = useState<string | null>(null);
  const [balance, setBalance] = useState(12_500n * 10_000_000n);

  const live = isLive();

  useEffect(() => {
    const unsub = demo().subscribe((e) => {
      if (e.name === "var_sync" || e.name === "depositfx") {
        setPool(demo().state());
      }
      setEvents((prev) => [e, ...prev].slice(0, 6));
    });
    const id = setInterval(() => {
      if (live) {
        fetchPoolState()
          .then(setPool)
          .catch(() => setPool(demo().state()));
      } else {
        setPool(demo().state());
      }
    }, 4000);
    if (live) {
      fetchPoolState()
        .then(setPool)
        .catch(() => setPool(demo().state()));
      fetchPositions(address ?? DEMO_USER_ADDR)
        .then(setPositions)
        .catch(() => setPositions(demo().positionsOf(address ?? DEMO_USER_ADDR)));
    }
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [live, address]);

  const connect = useCallback(
    async (kind: "freighter" | "albedo") => {
      setConnecting(true);
      setMutError(null);
      try {
        if (kind === "freighter") {
          const flex = await import("@stellar/freighter-api");
          const { isConnected, getAddress } = flex;
          const ok = await isConnected();
          if (!ok) {
            await flex.setAllowed?.();
          }
          const res = await getAddress();
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
          setAddress(res.pubkey);
        }
        setConnectedWallet(kind);
      } catch (err) {
        setMutError(err instanceof Error ? err.message : "connect failed");
      } finally {
        setConnecting(false);
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setConnectedWallet(null);
  }, []);

  // Mutation with an honest stage machine + timeouts that describe the chain.
  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setMutStage("awaiting-sign");
    setMutError(null);
    try {
      await new Promise((r) => setTimeout(r, 700));
      setMutStage("signing");
      await new Promise((r) => setTimeout(r, 700));
      setMutStage("confirming");
      const result = await fn();
      setMutStage("done");
      setTimeout(() => setMutStage("idle"), 1600);
      return result;
    } catch (err) {
      setMutStage("error");
      setMutError(err instanceof Error ? err.message : "transaction failed");
      throw err;
    }
  }, []);

  const mutateDeposit = useCallback(
    async (amountUnits: number) => {
      const pos = await runMutation(async () => {
        await new Promise((r) => setTimeout(r, 900));
        const p = demo().simulateDeposit(amountUnits);
        setBalance((b) => b - BigInt(Math.round(amountUnits)));
        return p;
      });
      setPositions(demo().positionsOf(address ?? DEMO_USER_ADDR));
      return pos;
    },
    [runMutation, address]
  );

  const mutateClaim = useCallback(
    async (id: number) => {
      await runMutation(async () => {
        await new Promise((r) => setTimeout(r, 800));
        demo().simulateClaim(id);
      });
      setPositions(demo().positionsOf(address ?? DEMO_USER_ADDR));
    },
    [runMutation, address]
  );

  const mutateRepay = useCallback(
    async (id: number) => {
      await runMutation(async () => {
        await new Promise((r) => setTimeout(r, 800));
        demo().simulateRepay(id);
      });
      setPositions(demo().positionsOf(address ?? DEMO_USER_ADDR));
    },
    [runMutation, address]
  );

  const quoteFor = useCallback((amountUnits: number) => {
    if (live) {
      return allocateQuote(amountUnits);
    }
    return demo().quote(amountUnits);
  }, [live]);

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
      balance: Number(balance),
      quoteFor,
      mutateDeposit,
      mutateClaim,
      mutateRepay,
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
      balance,
      quoteFor,
      mutateDeposit,
      mutateClaim,
      mutateRepay,
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