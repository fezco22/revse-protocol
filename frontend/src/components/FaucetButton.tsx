import { IconArrow } from "@/components/icons";

/** Links out to Circle's faucet for testnet USDC (opens in a new tab). */
export function FaucetButton({
  label = "Get testnet USDC",
}: {
  label?: string;
}) {
  return (
    <a
      href="https://faucet.circle.com"
      target="_blank"
      rel="noopener noreferrer"
      className="num inline-flex items-center gap-1.5 border border-signal/50 bg-signal/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-signal transition-colors hover:bg-signal/10"
    >
      {label}
      <IconArrow width={13} height={13} />
    </a>
  );
}
