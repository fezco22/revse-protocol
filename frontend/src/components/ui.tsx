"use client";

import type { ReactNode } from "react";

/** Hairline label row used everywhere: label left, value right, tabular. */
export function LedgerRow({
  label,
  value,
  tone = "default",
  mono = true,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "signal" | "risk" | "dim" | "warn";
  mono?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "text-ink",
    signal: "text-signal",
    risk: "text-risk",
    warn: "text-warn",
    dim: "text-ink-dim",
  };
  return (
    <div className="flex items-baseline justify-between border-b border-hairline/60 py-2.5 last:border-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`${mono ? "num" : ""} text-sm font-medium ${tones[tone]}`}>
        {value}
      </span>
    </div>
  );
}

export function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-hairline bg-surface">
      <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">
          {title}
        </h2>
        {meta && <div className="text-xs text-ink-muted">{meta}</div>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function StewardStrip({ children }: { children: ReactNode }) {
  return (
    <div className="border border-signal-dim/40 bg-signal/5 px-4 py-3">
      {children}
    </div>
  );
}

/** Live ticker pill: a small mono readout that flashes on value change. */
export function TickValue({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return (
    <span key={value} className="tick-flash num inline-block px-1">
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-hairline px-6 py-12 text-center">
      <span className="text-sm font-medium text-ink">{title}</span>
      <p className="max-w-[28ch] text-xs leading-relaxed text-ink-muted">
        {body}
      </p>
      {action}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}