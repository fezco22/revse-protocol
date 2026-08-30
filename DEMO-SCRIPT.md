# Revse Demo Video Script

Target length: about 2 to 3 minutes. Tone: calm, confident, no hype.
Format below: **[timestamp] SCREEN** then the voiceover line underneath.

Tip: read the voiceover out loud once before recording. If a sentence feels
awkward to say, cut it down. Short is better than clever.

---

## Cold open (0:00 to 0:15)

**[0:00] Landing page, slow scroll**

Lending rates on Stellar move every few seconds. That is great for the
protocol, but it means you never really know what you are going to earn, or what
your loan is going to cost you.

**[0:08] Pause on the hero headline**

Revse fixes that. You lock one rate, and you keep it for the whole term. That is
the whole idea.

---

## The problem, quickly (0:15 to 0:35)

**[0:15] Simple graphic or the overview section**

Say you deposit USDC today. The rate you see now can be completely different an
hour later. If you are planning around that yield, the number keeps sliding out
from under you.

**[0:26] Same view**

Revse quotes you a fixed APY, live, from an on-chain virtual AMM. You accept it,
and it is locked in. No surprises at the end of the month.

---

## Connect and fund (0:35 to 1:00)

**[0:35] Click Connect Wallet, pick Freighter**

Let me walk through it on testnet. I connect Freighter, already set to Testnet.

**[0:43] Wallet connected, balances show up**

Balances load straight from Horizon. If I only have XLM, no problem, because
there is a swap built right in.

**[0:50] Open the swap, XLM to USDC, one signature**

This runs through the native Stellar DEX as a path payment. One signature, and I
have USDC to work with. First time only, it adds the USDC trustline for you.

---

## The deposit (1:00 to 1:35)

**[1:00] Deposit screen, type an amount**

Here is the main flow. I enter how much USDC I want to lock for the 30 day term.

**[1:08] Highlight the live quote**

This APY is not a guess. It is quoted on-chain by the RateVAMM contract, based on
pool utilization, and it is the exact rate I am about to lock.

**[1:16] Click Deposit, sign in Freighter**

One signed transaction does everything. The contract pulls my USDC, locks the
rate, mints an fUSDC receipt, and saves the position.

**[1:26] Confirming state, then success**

The app waits for real on-chain confirmation before it moves on. When it clears,
it reads my brand new position straight back from the contract.

---

## Dashboard and borrow (1:35 to 2:05)

**[1:35] Dashboard with the new position**

Now it shows up on the dashboard. My position, my locked rate, maturity date, and
what I will claim at the end, all in one place.

**[1:46] Scroll to protocol health / stats**

Portfolio stats and live protocol health sit right next to it, so nothing is
hidden.

**[1:53] Borrow flow, briefly**

Borrowing is the mirror image. I post USDC as collateral and borrow at a fixed
cost, so my repayment is predictable too.

---

## Proof it is real (2:05 to 2:30)

**[2:05] Stellar Expert open on a contract**

None of this is mocked. Six contracts are live on Stellar Testnet, and you can
open every one of them on Stellar Expert.

**[2:14] Show the wallet activity or the events tab**

So far eleven wallets have actually used it on-chain, across real deposits,
borrows, and quotes. The full breakdown is in the repo.

**[2:22] Back to the app, calm ending shot**

That is Revse. Floating rates in, one fixed number out. Thanks for watching.

---

## If you need a 60 second cut

Use these four beats only:

1. **Problem (0:00 to 0:12):** Stellar lending rates move every few seconds, so
   you cannot plan your yield or your borrowing cost.
2. **Solution (0:12 to 0:22):** Revse locks one fixed APY for the whole term,
   priced live by an on-chain virtual AMM.
3. **Deposit (0:22 to 0:45):** Connect Freighter, swap XLM to USDC if needed,
   enter an amount, see the live locked rate, sign once, done.
4. **Proof (0:45 to 0:60):** Six contracts live on testnet, eleven wallets have
   used it, everything verifiable on Stellar Expert.

---

## Recording notes

- Have testnet USDC ready before you hit record so the faucet step does not stall
  the take.
- Keep the cursor slow. Let each signing popup fully appear before you click.
- If a transaction takes a few seconds to confirm, do not cut it out. That wait
  is proof it is real on-chain, and it is only a few seconds.
- Screen resolution clean, no extra browser tabs, wallet already on Testnet.
- One good uninterrupted take of the deposit flow is worth more than fancy edits.
