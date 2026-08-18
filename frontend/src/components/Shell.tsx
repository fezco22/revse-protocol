"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabBar } from "@/components/TabBar";
import { WalletButton } from "@/components/WalletButton";
import { AmbientField } from "@/components/AmbientField";
import { NAV } from "@/components/nav";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";

  return (
    <>
      {/* Landing renders its own hero backdrop; app pages get a quiet field. */}
      {!isLanding && <AmbientField />}
      <header className="sticky top-0 z-40 border-b border-hairline bg-carbon/90 backdrop-blur-md">
        <div
          className={`mx-auto flex h-14 items-center gap-6 px-4 sm:px-6 ${
            isLanding ? "max-w-6xl" : "max-w-6xl"
          }`}
        >
          <Link href={isLanding ? "/" : "/market"} className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-[4px] border border-hairline bg-surface">
              <Mark />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              Revse
            </span>
          </Link>

          {/* Global nav (desktop) */}
          {!isLanding && (
            <nav className="hidden flex-1 items-center gap-1 md:flex">
              {NAV.map(({ href, label }) => {
                const active = path === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`relative px-3 py-2 text-[13px] font-medium tracking-tight transition-colors ${
                      active
                        ? "text-signal"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {label}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-[15px] h-px bg-signal" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="ml-auto">{!isLanding && <WalletButton />}</div>
        </div>
      </header>

      {isLanding ? (
        <main className="w-full flex-1">{children}</main>
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 md:pb-12">
          {children}
        </main>
      )}

      {/* Mobile-only bottom tab bar; desktop uses the top nav */}
      {!isLanding && <TabBar />}
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
