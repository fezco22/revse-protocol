"use client";

import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";
import { WalletButton } from "@/components/WalletButton";
import { isDemo } from "@/lib/env";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline bg-carbon/90 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-[4px] border border-hairline bg-surface">
              <Mark />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              FixYield
            </span>
            {isDemo && (
              <span className="num ml-1 border border-hairline px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-warn">
                Demo
              </span>
            )}
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-6">
        {children}
      </main>

      <TabBar />
    </>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <path
        d="M7 18V6l5 10 5-10v12"
        fill="none"
        stroke="#E7E4DE"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 20h12"
        stroke="#4DE3A1"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}