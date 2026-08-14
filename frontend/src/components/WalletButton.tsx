"use client";

import { useApp } from "@/state/app";
import { shortAddr } from "@/lib/format";
import { IconWallet } from "@/components/icons";

export function WalletButton() {
  const { wallet, mutError } = useApp();

  if (wallet.address) {
    return (
      <button
        onClick={wallet.disconnect}
        className="num flex h-9 items-center gap-2 border border-hairline bg-surface px-3 text-xs text-ink transition-colors hover:border-ink-muted hover:text-signal"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal pulse-dot" />
        {shortAddr(wallet.address)}
      </button>
    );
  }

  return (
    <button
      onClick={() => void wallet.connect("freighter")}
      disabled={wallet.connecting}
      title={mutError ?? undefined}
      className="flex h-9 items-center gap-2 border border-hairline bg-surface px-3 text-xs font-medium text-ink transition-colors hover:border-ink-muted hover:text-signal disabled:opacity-50"
    >
      <IconWallet />
      {wallet.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}