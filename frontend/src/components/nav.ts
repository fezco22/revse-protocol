import type { ComponentType, SVGProps } from "react";
import {
  IconMarket,
  IconSimulate,
  IconSwap,
  IconBorrow,
  IconPositions,
} from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Single source of truth for primary navigation (top bar + mobile tab bar). */
export const NAV: NavItem[] = [
  { href: "/positions", label: "Dashboard", icon: IconPositions },
  { href: "/market", label: "Market", icon: IconMarket },
  { href: "/swap", label: "Swap", icon: IconSwap },
  { href: "/simulate", label: "Simulate", icon: IconSimulate },
  { href: "/borrow", label: "Borrow", icon: IconBorrow },
];
