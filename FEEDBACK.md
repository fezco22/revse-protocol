# User Feedback — Revse

Feedback gathered from early testnet users during the Level 4 beta. Testers
connected Freighter or Albedo on Stellar Testnet, funded USDC through the in-app
swap, and ran the deposit, borrow, and claim flows. Names are anonymized to
wallet handles. Responses are representative of the recurring themes we heard.

## Raw feedback

**Tester A (depositor, `GBFX…HMHXQ`)**
"The single-signature deposit is the best part. I have used other Stellar apps
where I sign three times and lose track of what I approved. Here I hit deposit
once and the position showed up. The locked APY being the exact number I saw on
screen made it feel trustworthy. One thing: I did not know the rate could shift a
little between the moment I looked at the quote and the moment I signed, so a
short note about that would help."

**Tester B (new to Stellar, `GBTR…MKNE`)**
"Onboarding took me a few tries. I had XLM but no USDC, and I did not understand
the trustline step at first. Once I found the swap inside the app it clicked, but
before that I almost gave up. If the app walked me through swap then trustline
then deposit as clear steps, I would have been done in half the time."

**Tester C (borrower, `GAYH…PQH6`)**
"Borrowing at a fixed cost is genuinely useful. I locked a position and borrowed
against it and the repayment number never moved, which is the whole point. What I
missed was a clear view of my collateral ratio and how close I am to liquidation.
I want a health bar or a warning color, not just raw numbers."

**Tester D (DeFi user, `GCUF…XJ6T`)**
"Solid MVP. The dashboard showing total deposits, projected interest, and
maturity in one place is clean and it loads fast on mobile. My blockers for
putting real size in later: it is one term and one asset today, and the yield
sits on a mock pool rather than a live lending market. Add 7 and 90 day terms and
a real pool integration and this gets interesting."

## Summary

**What is working**
- The single-signature deposit is the standout. Testers found it fast and
  trustworthy, especially the guarantee that the locked APY equals the quoted APY.
- Fixed-cost borrowing does what it promises. Repayment amounts stay put, which
  is exactly the predictability the product is selling.
- The dashboard reads well and performs well on mobile. Positions, projected
  interest, and maturity in one screen was called out more than once.

**Top requests, in priority order**
1. **Guided onboarding.** Swap, trustline, and deposit should be a clear
   step-by-step flow. This was the single biggest source of first-time friction.
2. **Borrow risk visibility.** Show collateral ratio and a liquidation warning
   (health bar or color state), not just raw numbers.
3. **Quote drift note.** Tell users the fixed rate can move slightly between
   viewing the quote and signing, so the locked number is never a surprise.
4. **More terms and a real yield source.** 7 and 90 day terms plus a live pool
   integration (beyond the current mock pool) are the main blockers to larger,
   repeat deposits.

**How this maps to the roadmap**
- Near term: guided onboarding flow and borrow health indicators are UI work and
  are next up.
- Mid term: multi-term support (7 / 30 / 90 days).
- Later: replace the mock pool with a live lending market, then mainnet with an
  audit.
