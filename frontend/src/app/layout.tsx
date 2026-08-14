/*
  DIRECTION CONTRACT — FixYield instrument surface
  ------------------------------------------------
  WORLD: A fixed-income instrument printed on dark paper. The savings product
  IS the certificate. Ink on carbon, tabular numerals, hairline ledger rules,
  a stamped maturity date. The rate is shown honestly as two paired columns:
  the fixed rate you lock vs the floating hedge that backs it — the VAMM
  delta hedge made visible, not hidden.

  PALETTE  carbon #0A0B0D / surface #121316 / raised #181A1E
           hairline #26282E · ink (body) bone #E7E4DE · ink-muted #97949C
           SIGNAL (live rates) mint #4DE3A1 — one color, used for nothing else
           RISK (liquidation/collateral) vermilion #FF5C64 · WARN (maturity) #F0B35E
  TYPE     IBM Plex Sans for UI copy · IBM Plex Mono for every numeral and
           data label (tabular, tabular-nums on). Scale is a ledger: tiny
           captions, generous emptiness, one monumental number per screen.
  RULES    hairline borders only, 1px, never thick color rules. Radius 0 (no
           pills, no ghost cards). Depth is layered paper: shadows are soft
           offset, subtle. Motion: one authored moment per screen — the
           certificate issue stamps down on deposit; rate ticks flip like a
           split-flap; everything else eases with a fast exit.
  SURFACES browser chrome themed: selection = mint on carbon, caret mint,
           scrollbar = hairline track / ink thumb, tabular data tabular-nums.
  ANTI     no gradient text, no glass, no glowing cards, no emoji icons —
           geometry + one consistent 1.5px stroke icon set.
*/
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FixYield — fixed-rate savings on Stellar",
  description:
    "Lock a fixed yield on your USDC for 30 days. The rate is held by a delta-hedged VAMM, not promised.",
  icons: { icon: "/mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="bg-carbon text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}