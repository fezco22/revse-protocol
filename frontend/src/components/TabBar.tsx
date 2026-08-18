"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/nav";

export function TabBar() {
  const path = usePathname();

  // Landing has no tab navigation; it exists to get you in.
  if (path === "/") return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-carbon/95 backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex h-14 max-w-2xl items-stretch">
        {NAV.map(({ href, label, icon: Icon }) => {
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
              {active && <span className="absolute top-0 h-px w-8 bg-signal" />}
              <Icon width={18} height={18} />
              <span className="text-[9px] font-medium tracking-wide">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
