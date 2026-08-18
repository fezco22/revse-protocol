# Revse: Level 4 (Green Belt) Submission

Fixed-rate lending market on Stellar. A user locks a fixed APY on USDC for a
fixed term, priced by an on-chain virtual AMM, with real deposit, borrow, repay,
claim, and an in-app XLM to USDC swap.

---

## Submission Idea

### Problem Statement
Lending rates on Stellar (Blend and similar pools) float and reprice every
ledger, roughly every 5 seconds. Depositors and borrowers cannot predict their
cash flow. Institutions, treasuries, and everyday savers want a fixed,
predictable rate for a set term. Stellar has no approachable, mobile-first
fixed-rate product today.

### Why Stellar
- Soroban smart contracts (Rust) give cheap, fast execution for the pricing
  engine and multi-contract settlement.
- The SEP-41 token interface and the USDC Stellar Asset Contract standardize
  deposits and payouts.
- The built-in DEX (order books plus AMM pools) lets users swap XLM to USDC
  inside the app with a single signature, so onboarding does not need an
  external exchange.
- Low fees and fast finality make small, frequent fixed-income positions viable.

### Target Users
1. Crypto-native savers who want predictable yield on stablecoins instead of a
   floating rate.
2. SMEs, DAOs, and treasuries that need a fixed borrowing cost for short-term
   working capital.
3. DeFi users arbitraging the fixed versus floating spread, which drives rate
   discovery for the pool.

### Technical Architecture
- Frontend: Next.js 16, React 19, TypeScript, mobile-first. Wallet connect via
  Freighter and Albedo. Pool state and positions are read from Soroban RPC,
  account balances from Horizon.
- Contracts (Soroban, Rust), six deployed on testnet: OracleHub, RateVAMM (the
  virtual AMM that prices the fixed rate from utilization), PositionSettlement
  (vault, positions, claim, repay, liquidation), StrategyAdapter, fUSDC receipt
  token, and MockPool.
- Deposit flow: the user signs one transaction. PositionSettlement pulls USDC,
  calls RateVAMM to lock the rate, mints fUSDC, and stores the position. The UI
  reads results back through RPC and Horizon, waiting for on-chain confirmation.
- Swap flow: XLM to USDC through a Stellar path payment on the native DEX, with
  a live quote from Horizon and a one-time USDC trustline step.

### Complexity Evaluation
- On-chain fixed-income math: a virtual AMM prices a fixed APY from a
  constant-product curve plus utilization, with property-tested invariants (no
  free lunch, rate monotonicity, solvency).
- A multi-contract system with inter-contract calls and auth threading so a
  deposit needs only one wallet signature.
- Real asset movement using the USDC Stellar Asset Contract, plus a native DEX
  swap, both authorized and signed by the user.

### Roadmap
- MVP (now): single USDC pool, 30-day term, live on testnet. Deposit, borrow,
  repay, claim, and swap all work end to end.
- User acquisition (Level 4 to 5): onboard 10 then 50 real users, collect
  feedback, add multi-term options (7, 30, 90 days).
- Mainnet (Level 6): real USDC, security audit, monitoring, and mainnet launch.

---

## Deployed Contracts (Stellar Testnet)

| Contract | Address |
|---|---|
| PositionSettlement | CAT6GJUGH4QICPWYB4AMVNKKE6KXMYH7FT4ZELSSWXX34E6TRV7VAZTI |
| RateVAMM | CCU45TFE7U2HF7EN6MPPS4JDR5FHCT6FJBUGMP3V6MVPFNYDOJNEBNS3 |
| OracleHub | CABZUUX5QZ677NR2N6XVZY3RF76CRFAV7HLHMFNHS5HCD5MBLNOO6ZUT |
| StrategyAdapter | CDNQHVNS2KIXLIAW2C2VGHQOGJKORVOAZUL3QR4J72G5WFHHC7XSKG5S |
| fUSDC | CDHYA7EMHF4JOXRLJWT627EFQMPU5LM663IKCGYEIKI2EE2QWFNOVL7B |
| MockPool | CCVSBTACL4E7RHZKENSCR2NZ6WKUOJZB7VUCZMOC3VWC3GHZQRKBQWVY |
| USDC (SAC) | CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA |

---

## Level 4 Checklist Status

Done in code and committed:

- [x] Production-ready MVP, real on-chain flows (deposit, borrow, repay, claim, swap)
- [x] Stable frontend and contract architecture
- [x] Mobile responsive UI
- [x] Loading states and error handling (stage machine, tx confirmation wait)
- [x] Smart contracts deployed on Stellar testnet (six contracts)
- [x] Monitoring and analytics integration (Vercel Analytics, Speed Insights, error boundary)
- [x] Proper project structure and documentation (README, this file)
- [x] 15+ meaningful commits

Needs an account or real users (owner to complete):

- [ ] Public GitHub repository (create repo, push)
- [ ] Production deployment on Vercel (import repo, root directory = frontend)
- [ ] 10+ real users onboarded, with wallet interaction proof
- [ ] Basic user feedback collection (form) and summary
- [ ] Live demo video (1 to 2 minutes)
- [ ] Screenshots: product UI, mobile view, analytics dashboard
