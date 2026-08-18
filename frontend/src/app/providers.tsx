"use client";

import type React from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppProvider, useApp } from "@/state/app";
import { Shell } from "@/components/Shell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * All app pages (anything but the landing page) require a connected wallet.
 * The landing page is public; everything else redirects here until the user
 * connects via Freighter or Albedo.
 */
function WalletGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { wallet, booted } = useApp();

  const isPublic = path === "/";

  useEffect(() => {
    // Only redirect once the persisted session has been restored, so a
    // refresh/deep-link of a connected user isn't bounced to the landing.
    if (booted && !isPublic && !wallet.connected) {
      router.replace("/");
    }
  }, [booted, isPublic, wallet.connected, router]);

  if (isPublic || wallet.connected) {
    return <>{children}</>;
  }
  // Server + first client render agree (not yet connected), so no flash and
  // no hydration mismatch; the redirect above fires right after mount.
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AppProvider>
        <WalletGate>
          <Shell>{children}</Shell>
        </WalletGate>
      </AppProvider>
    </ErrorBoundary>
  );
}