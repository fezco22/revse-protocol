"use client";

import type React from "react";
import { AppProvider } from "@/state/app";
import { Shell } from "@/components/Shell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}