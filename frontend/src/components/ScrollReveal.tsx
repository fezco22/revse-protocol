"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children with a smooth fade, rise, and slight scale the first
 * time they scroll into view (IntersectionObserver). Transitions are zeroed for
 * reduced-motion users via the global media rule, so this stays accessible.
 */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  pop = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** stronger reveal: rises from below, overshoots up, then settles */
  pop?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (pop) {
    return (
      <div
        ref={ref}
        style={{ animationDelay: `${delay}ms` }}
        className={`${shown ? "pop-up" : "opacity-0"} ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown
          ? "translate-y-0 scale-100 opacity-100 blur-0"
          : "translate-y-10 scale-[0.97] opacity-0 blur-[2px]"
      } ${className}`}
    >
      {children}
    </div>
  );
}
