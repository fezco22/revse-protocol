#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, vec, Address, Env, IntoVal,
    Map, String, Symbol, Vec,
};

use common::{checked_mul_div, mul_rate, term_interest, RATE_SCALE};

#[contractevent(topics = ["pause"], data_format = "vec")]
struct PauseEvent {
    paused: bool,
}

#[contractevent(topics = ["depositfx"], data_format = "vec")]
struct DepositFx {
    id: u64,
    user: Address,
    amount: i128,
    apy: i128,
    maturity_ts: u64,
    interest: i128,
}

#[contractevent(topics = ["borrowfx"], data_format = "vec")]
struct BorrowFx {
    id: u64,
    user: Address,
    amount: i128,
    apy: i128,
    maturity_ts: u64,
    collateral: i128,
    interest: i128,
}

#[contractevent(topics = ["matclaim"], data_format = "vec")]
struct MatClaim {
    id: u64,
    user: Address,
    payout: i128,
}

#[contractevent(topics = ["repay"], data_format = "vec")]
struct RepayEvent {
    id: u64,
    user: Address,
    owed: i128,
}

#[contractevent(topics = ["liquidate"], data_format = "vec")]
struct LiquidateEvent {
    id: u64,
    user: Address,
    keeper_bonus: i128,
    reason: String,
}

const ADMIN: Symbol = symbol_short!("ADMIN");
const VAMM: Symbol = symbol_short!("VAMM");
const ORACLE: Symbol = symbol_short!("ORACLE");
const TOKEN: Symbol = symbol_short!("TOKEN"); // USDC SAC
const FUSDC: Symbol = symbol_short!("FUSDC");
const STRATEGY: Symbol = symbol_short!("STRAT");
const PAUSED: Symbol = symbol_short!("PAUSED");
const NEXT_ID: Symbol = symbol_short!("NEXTID");
const POSITIONS: Symbol = symbol_short!("POSITIONS");
const MIN_COLLAT_RATIO: Symbol = symbol_short!("MINCOLLAT");
const LIQ_THRESHOLD: Symbol = symbol_short!("LIQTHRESH");
const PROTOCOL_FEE_BPS: Symbol = symbol_short!("PROTFEE");
const REENTRANCY: Symbol = symbol_short!("REENTRY");
const INITIALIZED: Symbol = symbol_short!("INITED");

/// Side of a fixed-rate position.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Side {
    Deposit,
    Borrow,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position {
    pub id: u64,
    pub user: Address,
    pub side: Side,
    pub amount: i128, // principal (USDC micro-units)
    pub apy: i128,    // fixed apy at open (RATE_SCALE)
    pub open_ts: u64, // when the position was opened
    pub maturity_ts: u64,
    pub collateral: i128, // collateral (USDC micro-units) for Borrow
    pub claimed: bool,
    pub liquidated: bool,
}

#[contract]
pub struct PositionSettlement;

#[contractimpl]
impl PositionSettlement {
    pub fn init(
        env: Env,
        admin: Address,
        vamm: Address,
        oracle: Address,
        token: Address,
        fusdc: Address,
        strategy: Address,
        min_collat_ratio: i128, // e.g. 150% -> 1_500_000_000
        liq_threshold: i128,    // e.g. 110% -> 1_100_000_000
        protocol_fee_bps: i128,
    ) {
        env.storage().instance().set(&INITIALIZED, &true);
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&VAMM, &vamm);
        env.storage().instance().set(&ORACLE, &oracle);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&FUSDC, &fusdc);
        env.storage().instance().set(&STRATEGY, &strategy);
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&NEXT_ID, &1u64);
        env.storage()
            .instance()
            .set(&MIN_COLLAT_RATIO, &min_collat_ratio);
        env.storage().instance().set(&LIQ_THRESHOLD, &liq_threshold);
        env.storage()
            .instance()
            .set(&PROTOCOL_FEE_BPS, &protocol_fee_bps);
        env.storage().instance().set(&REENTRANCY, &false);
    }

    // ---------- admin ----------

    pub fn set_paused(env: Env, paused: bool) {
        admin_check(&env);
        env.storage().instance().set(&PAUSED, &paused);
        PauseEvent { paused }.publish(&env);
    }

    pub fn set_strategy(env: Env, strategy: Address) {
        admin_check(&env);
        env.storage().instance().set(&STRATEGY, &strategy);
    }

    pub fn set_risk_params(env: Env, min_collat_ratio: i128, liq_threshold: i128) {
        admin_check(&env);
        if min_collat_ratio <= liq_threshold {
            panic!("position-settlement: min_collat must exceed liq threshold");
        }
        env.storage()
            .instance()
            .set(&MIN_COLLAT_RATIO, &min_collat_ratio);
        env.storage().instance().set(&LIQ_THRESHOLD, &liq_threshold);
    }

    // ---------- fixed-rate deposit flow ----------

    /// User locks USDC at the current quoted fixed APY until maturity.
    /// flow: quote -> pull USDC -> open position -> mint fUSDC -> allocate idle to strategy
    pub fn deposit_fixed(env: Env, user: Address, amount: i128) -> u64 {
        check_paused(&env);
        if amount <= 0 {
            panic!("position-settlement: amount must be positive");
        }
        enter(&env);
        user.require_auth();

        let vamm: Address = env.storage().instance().get(&VAMM).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let fusdc: Address = env.storage().instance().get(&FUSDC).unwrap();

        // 1. Quote + execute the virtual trade on the VAMM.
        let quote: common::QuoteInfo = env.invoke_contract(
            &vamm,
            &Symbol::new(&env, "deposit_fixed"),
            (amount,).into_val(&env),
        );
        let apy = quote.apy;
        let term: u64 = env.invoke_contract(&vamm, &symbol_short!("term"), ().into_val(&env));

        // 2. Pull USDC from the user (SAC transfer_from with spender = this contract).
        let sac_transfer_from: Symbol = Symbol::new(&env, "transfer_from");
        let _: () = env.invoke_contract(
            &token,
            &sac_transfer_from,
            (
                env.current_contract_address(),
                user.clone(),
                env.current_contract_address(),
                amount,
            )
                .into_val(&env),
        );

        // 3. Open the position.
        let id = next_id(&env);
        let open_ts = env.ledger().timestamp();
        let maturity_ts = open_ts + term;
        let pos = Position {
            id,
            user: user.clone(),
            side: Side::Deposit,
            amount,
            apy,
            open_ts,
            maturity_ts,
            collateral: 0,
            claimed: false,
            liquidated: false,
        };
        let mut positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        positions.set(id, pos.clone());
        env.storage().persistent().set(&POSITIONS, &positions);

        // 4. Mint fUSDC 1:1 to the user.
        let _: () = env.invoke_contract(
            &fusdc,
            &symbol_short!("mint"),
            (user.clone(), amount).into_val(&env),
        );

        let interest = term_interest(&env, apy, term);
        DepositFx {
            id,
            user: user.clone(),
            amount,
            apy,
            maturity_ts,
            interest,
        }
        .publish(&env);
        exit(&env);
        id
    }

    // ---------- maturity claim ----------

    /// At maturity, burn fUSDC and pay principal + accrued fixed interest.
    pub fn claim_maturity(env: Env, position_id: u64) -> i128 {
        check_paused(&env);
        enter(&env);
        let mut positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        let pos = positions
            .get(position_id)
            .expect("position-settlement: no such position");
        if pos.side != Side::Deposit {
            panic!("position-settlement: not a deposit position");
        }
        if pos.claimed || pos.liquidated {
            panic!("position-settlement: position already settled");
        }
        pos.user.require_auth();
        let now = env.ledger().timestamp();
        if now < pos.maturity_ts {
            panic!("position-settlement: not yet mature");
        }

        let term = pos.maturity_ts - pos.open_ts;
        let interest = term_interest(&env, pos.apy, term.min(common::MAX_TERM_SECONDS));
        let payout = pos.amount + interest;

        let fusdc: Address = env.storage().instance().get(&FUSDC).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();

        // Burn fUSDC (user -> 0). Uses transfer to contract then burn.
        let _: () = env.invoke_contract(
            &fusdc,
            &symbol_short!("transfer"),
            (pos.user.clone(), env.current_contract_address(), pos.amount).into_val(&env),
        );
        let _: () = env.invoke_contract(
            &fusdc,
            &symbol_short!("burn"),
            (env.current_contract_address(), pos.amount).into_val(&env),
        );

        // Pay out USDC from the vault to the user.
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (env.current_contract_address(), pos.user.clone(), payout).into_val(&env),
        );

        let mut new_pos = pos.clone();
        new_pos.claimed = true;
        positions.set(position_id, new_pos);
        env.storage().persistent().set(&POSITIONS, &positions);
        MatClaim {
            id: position_id,
            user: pos.user.clone(),
            payout,
        }
        .publish(&env);
        exit(&env);
        payout
    }

    // ---------- fixed-rate borrow flow (backed by over-collateralization) ----------

    pub fn borrow_fixed(
        env: Env,
        user: Address,
        collateral_amount: i128,
        borrow_amount: i128,
    ) -> u64 {
        check_paused(&env);
        if collateral_amount <= 0 || borrow_amount <= 0 {
            panic!("position-settlement: amounts must be positive");
        }
        enter(&env);
        user.require_auth();

        // Collateral adequacy vs the configured minimum ratio.
        let min_ratio: i128 = env.storage().instance().get(&MIN_COLLAT_RATIO).unwrap();
        let collat_value = collateral_amount; // USDC collateral, 1:1
        let required = mul_rate(&env, borrow_amount, min_ratio);
        if collat_value < required {
            panic!("position-settlement: collateral below minimum ratio");
        }

        let vamm: Address = env.storage().instance().get(&VAMM).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let quote: common::QuoteInfo = env.invoke_contract(
            &vamm,
            &Symbol::new(&env, "deposit_fixed"),
            (borrow_amount,).into_val(&env),
        );
        let apy = quote.apy;
        let term: u64 = env.invoke_contract(&vamm, &symbol_short!("term"), ().into_val(&env));

        // Pull collateral USDC into the vault.
        let _: () = env.invoke_contract(
            &token,
            &Symbol::new(&env, "transfer_from"),
            (
                env.current_contract_address(),
                user.clone(),
                env.current_contract_address(),
                collateral_amount,
            )
                .into_val(&env),
        );

        // Disburse the borrowed USDC to the user.
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (env.current_contract_address(), user.clone(), borrow_amount).into_val(&env),
        );

        let id = next_id(&env);
        let open_ts = env.ledger().timestamp();
        let maturity_ts = open_ts + term;
        let pos = Position {
            id,
            user: user.clone(),
            side: Side::Borrow,
            amount: borrow_amount,
            apy,
            open_ts,
            maturity_ts,
            collateral: collateral_amount,
            claimed: false,
            liquidated: false,
        };
        let mut positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        positions.set(id, pos.clone());
        env.storage().persistent().set(&POSITIONS, &positions);

        let interest = term_interest(&env, apy, term);
        BorrowFx {
            id,
            user: user.clone(),
            amount: borrow_amount,
            apy,
            maturity_ts,
            collateral: collateral_amount,
            interest,
        }
        .publish(&env);
        exit(&env);
        id
    }

    /// Repay principal + accrued interest, unlock collateral.
    pub fn repay(env: Env, position_id: u64) -> i128 {
        check_paused(&env);
        enter(&env);
        let mut positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        let pos = positions
            .get(position_id)
            .expect("position-settlement: no such position");
        if pos.side != Side::Borrow {
            panic!("position-settlement: not a borrow position");
        }
        if pos.claimed || pos.liquidated {
            panic!("position-settlement: position already settled");
        }
        pos.user.require_auth();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let term = pos.maturity_ts - pos.open_ts;
        let interest = term_interest(&env, pos.apy, term.min(common::MAX_TERM_SECONDS));
        let owed = pos.amount + interest;

        // Pull repayment from the user into the vault.
        let _: () = env.invoke_contract(
            &token,
            &Symbol::new(&env, "transfer_from"),
            (
                env.current_contract_address(),
                pos.user.clone(),
                env.current_contract_address(),
                owed,
            )
                .into_val(&env),
        );

        // Return collateral to the user.
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (
                env.current_contract_address(),
                pos.user.clone(),
                pos.collateral,
            )
                .into_val(&env),
        );

        let mut new_pos = pos.clone();
        new_pos.claimed = true;
        positions.set(position_id, new_pos);
        env.storage().persistent().set(&POSITIONS, &positions);
        RepayEvent {
            id: position_id,
            user: pos.user.clone(),
            owed,
        }
        .publish(&env);
        exit(&env);
        owed
    }

    /// Liquidate an underwater borrow position. Callable by anyone (keeper).
    pub fn liquidate(env: Env, position_id: u64) -> i128 {
        enter(&env);
        let mut positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        let pos = positions
            .get(position_id)
            .expect("position-settlement: no such position");
        if pos.side != Side::Borrow {
            panic!("position-settlement: not a borrow position");
        }
        if pos.claimed || pos.liquidated {
            panic!("position-settlement: position already settled");
        }
        let now = env.ledger().timestamp();
        // Two liquidation triggers: maturity default or underwater collateral.
        let (collat_value, is_default) = if now >= pos.maturity_ts {
            (0i128, true)
        } else {
            let liq_threshold: i128 = env.storage().instance().get(&LIQ_THRESHOLD).unwrap();
            // collateral vs outstanding. Collateral is USDC so price = 1.
            let value = pos.collateral;
            let elapsed = (now - pos.open_ts).min(common::MAX_TERM_SECONDS);
            let outstanding = pos.amount + term_interest(&env, pos.apy, elapsed);
            (
                value,
                checked_mul_div(&env, value, RATE_SCALE, outstanding) < liq_threshold,
            )
        };
        if !is_default && collat_value > 0 {
            panic!("position-settlement: position not liquidatable");
        }

        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let caller = env.current_contract_address();

        // Seize collateral to the caller (keeper incentive) minus protocol fee.
        let fee_bps: i128 = env.storage().instance().get(&PROTOCOL_FEE_BPS).unwrap();
        let keeper_bonus = pos.collateral - checked_mul_div(&env, pos.collateral, fee_bps, 10_000);
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (env.current_contract_address(), caller, keeper_bonus).into_val(&env),
        );

        let mut new_pos = pos.clone();
        new_pos.liquidated = true;
        positions.set(position_id, new_pos);
        env.storage().persistent().set(&POSITIONS, &positions);
        LiquidateEvent {
            id: position_id,
            user: pos.user.clone(),
            keeper_bonus,
            reason: String::from_str(&env, "underwater"),
        }
        .publish(&env);
        exit(&env);
        keeper_bonus
    }

    // ---------- strategy plumbing ----------

    /// Deploy idle USDC in the vault to the yield strategy (Blend/mock pool).
    pub fn allocate(env: Env, amount: i128) -> i128 {
        admin_check(&env);
        check_paused(&env);
        let strategy: Address = env.storage().instance().get(&STRATEGY).unwrap();
        let _: i128 = env.invoke_contract(
            &strategy,
            &symbol_short!("allocate"),
            (env.current_contract_address(), amount).into_val(&env),
        );
        amount
    }

    /// Pull funds back from the strategy to the vault.
    pub fn withdraw_from_strategy(env: Env, amount: i128) -> i128 {
        admin_check(&env);
        let strategy: Address = env.storage().instance().get(&STRATEGY).unwrap();
        let _: i128 = env.invoke_contract(
            &strategy,
            &symbol_short!("withdraw"),
            (env.current_contract_address(), amount).into_val(&env),
        );
        amount
    }

    // ---------- views ----------

    pub fn get_position(env: Env, id: u64) -> Option<Position> {
        let positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        positions.get(id)
    }

    pub fn positions_of(env: Env, user: Address) -> Vec<u64> {
        let positions: Map<u64, Position> = env
            .storage()
            .persistent()
            .get(&POSITIONS)
            .unwrap_or_else(|| Map::new(&env));
        let mut out: Vec<u64> = vec![&env];
        for (id, pos) in positions.iter() {
            if pos.user == user {
                out.push_back(id);
            }
        }
        out
    }

    pub fn paused(env: Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }
}

fn check_paused(env: &Env) {
    if env.storage().instance().get(&PAUSED).unwrap_or(false) {
        panic!("position-settlement: paused");
    }
}

fn enter(env: &Env) {
    if env.storage().instance().get(&REENTRANCY).unwrap_or(false) {
        panic!("position-settlement: reentrancy");
    }
    env.storage().instance().set(&REENTRANCY, &true);
}

fn exit(env: &Env) {
    env.storage().instance().set(&REENTRANCY, &false);
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&NEXT_ID).unwrap();
    env.storage().instance().set(&NEXT_ID, &(id + 1));
    id
}

fn admin_check(env: &Env) {
    let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    admin.require_auth();
}
