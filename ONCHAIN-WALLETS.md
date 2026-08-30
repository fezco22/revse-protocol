# On-Chain Wallet Activity — Revse (Stellar Testnet)

Snapshot of every wallet that has interacted with the deployed Revse contracts,
derived from on-chain **contract events** (Stellar Expert API, testnet).

- **Network:** Stellar Testnet (`Test SDF Network ; September 2015`)
- **Snapshot date:** 2026-08-31
- **Method:** unique `initiator` addresses across all contract events (state-changing
  calls only — pure view/quote reads and admin `init` calls that emit no event are
  not counted).

## Summary

| Metric | Value |
|---|---|
| **Total distinct wallets** | **11** |
| — end-user wallets | 10 |
| — admin / protocol operator | 1 |
| Deposits opened (`depositfx`) | 10 |
| Fixed-rate borrows (`borrowfx`) | 4 |
| VAMM quotes locked (`fxquote`) | 14 |
| fUSDC mints (`mint`) | 10 |
| Oracle feed/rate updates (`feed_upd`) | 1 |

Depositor wallets: 8 · Borrower wallets: 4 (2 wallets both deposited **and** borrowed).

## What a wallet does in Revse

A wallet touches the protocol through **PositionSettlement** (the vault), which
internally calls the other five contracts. The event a wallet emits tells you the role:

| Event | Contract | What the wallet did |
|---|---|---|
| `depositfx` | position-settlement | Deposited USDC and opened a **30-day fixed-yield position** (locks the fixed APY). |
| `borrowfx` | position-settlement | **Borrowed** USDC against a fixed position as collateral. |
| `fxquote` | rate-vamm | The vAMM priced the fixed APY for that deposit/borrow (emitted on every open). |
| `mint` | fusdc | fUSDC receipt token minted 1:1 to the depositor. |
| `feed_upd` | oracle-hub | **Admin/reporter only** — pushed a variable-rate / price feed update. |

`mock-pool` and `strategy-adapter` have no direct user events — they are called
internally by the vault to route idle USDC into the yield source.

## Wallets

### Admin / protocol operator

| Wallet | Role | Activity |
|---|---|---|
| `GDJUDO46…E35N` | Deployer + oracle reporter | Deployed & initialized all 6 contracts; 1× `feed_upd` on oracle-hub. |

### End-user wallets

| # | Wallet | Deposits | Borrows | Quotes | Mints | First → Last | Profile |
|---|---|:--:|:--:|:--:|:--:|---|---|
| 1 | `GBFXKBAI…HXQ` | 3 | 1 | 4 | 3 | 08-15 → 08-31 | Power user — multiple deposits + a borrow, active across 16 days |
| 2 | `GCUFOJXO…J6T` | 1 | 0 | 1 | 1 | 08-30 | Depositor |
| 3 | `GBXFOPGL…4KP` | 1 | 0 | 1 | 1 | 08-31 | Depositor |
| 4 | `GBTRZAC4…KNE` | 1 | 0 | 1 | 1 | 08-31 | Depositor |
| 5 | `GBCRTAQT…HMZ` | 1 | 0 | 1 | 1 | 08-31 | Depositor |
| 6 | `GBJCSZMT…I5N` | 1 | 0 | 1 | 1 | 08-31 | Depositor |
| 7 | `GB2QC4LS…3R7` | 1 | 0 | 1 | 1 | 08-31 | Depositor |
| 8 | `GAYHJ7KR…QH6` | 1 | 1 | 2 | 1 | 08-31 | Deposit + borrow (full round-trip) |
| 9 | `GAU7LJUU…JCH` | 0 | 1 | 1 | 0 | 08-31 | Borrower |
| 10 | `GCY3OLDN…CK3` | 0 | 1 | 1 | 0 | 08-31 | Borrower |

## Full addresses

| Short | Full address |
|---|---|
| Admin | `GDJUDO46NIRDVWKXMH7NNZD6DW3NOQJ66ISU2E2CCAGVKP6K5JD5E35N` |
| 1 | `GBFXKBAICDSSZJCJVQO3ZHHDMYTAIMNEGXPXRUVPNOPSCHLOB34HMHXQ` |
| 2 | `GCUFOJXO3RAYAMBJIKAZBC5DW35LNBVX44IW54DDRHKJR3Y6T6QFXJ6T` |
| 3 | `GBXFOPGLUQGS4ZPSONQ4T6MWELS2LD6EMLDWZ2JNC5O73MRRFFA7C4KP` |
| 4 | `GBTRZAC46A7B4SG7HHZGK24U57UIKC5S35K6KPE5SXP5IXXDVMAJMKNE` |
| 5 | `GBCRTAQT5MDGJPCUDWNKYYUS5UK7ED6HTFUKDNXXMHUO5CYADPRYUHMZ` |
| 6 | `GBJCSZMTYU6JYF6JTCT3DGQE5IDJQTGZC6WDNU4VBXAXNO5PQMY4CI5N` |
| 7 | `GB2QC4LSIE3GUECTZOUFJFK7NJM3S5N57XFP36YFCOCBEW6D44IWX3R7` |
| 8 | `GAYHJ7KRV3DFQVWLJIG6WM72MV25DZPVGMQMKPQKO7WVAIWNSMHEPQH6` |
| 9 | `GAU7LJUUFVIIX45NQVRBYA4RCADVDS2SG5LPZQ4ZVTMA5MDID7YCXJCH` |
| 10 | `GCY3OLDN7OONNSCM7AHPOIK2IJEIWUTZ5DBZ2GXHZU6DOP2MXUWILCK3` |

## Deployed contracts referenced

| Contract | ID |
|---|---|
| position-settlement | `CAT6GJUGH4QICPWYB4AMVNKKE6KXMYH7FT4ZELSSWXX34E6TRV7VAZTI` |
| rate-vamm | `CCU45TFE7U2HF7EN6MPPS4JDR5FHCT6FJBUGMP3V6MVPFNYDOJNEBNS3` |
| fusdc | `CDHYA7EMHF4JOXRLJWT627EFQMPU5LM663IKCGYEIKI2EE2QWFNOVL7B` |
| oracle-hub | `CABZUUX5QZ677NR2N6XVZY3RF76CRFAV7HLHMFNHS5HCD5MBLNOO6ZUT` |
| mock-pool | `CCVSBTACL4E7RHZKENSCR2NZ6WKUOJZB7VUCZMOC3VWC3GHZQRKBQWVY` |
| strategy-adapter | `CDNQHVNS2KIXLIAW2C2VGHQOGJKORVOAZUL3QR4J72G5WFHHC7XSKG5S` |

> Regenerate: query each contract's `/events` on the Stellar Expert testnet API and
> collect unique `initiator` addresses.
