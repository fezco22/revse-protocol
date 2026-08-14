"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconMarket,
  IconDeposit,
  IconPositions,
  IconHealth,
  IconBorrow,
} from "@/components/icons";

const tabs = [
  { href: "/", label: "Market", icon: IconMarket },
  { href: "/deposit", label: "Deposit", icon: IconDeposit },
  { href: "/positions", label: "Positions", icon: IconPositions },
  { href: "/health", label: "Health", icon: IconHealth },
  { href: "/borrow", label: "Borrow", icon: IconBorrow },
];

export function TabBar() {
  const path = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-carbon/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-2xl items-stretch">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-signal"
                  : "flex flex-1 flex-col items-center justify-center gap-0.5 text-ink-muted hover:text-ink"
              }
            >
              {active && (
                <span className="absolute top-0 h-px w-8 bg-signal" />
              )}
              <Icon />
              <span className="text-[10px] font-medium tracking-wide">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}