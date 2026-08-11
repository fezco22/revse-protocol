#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, Address, Env, IntoVal,
    Symbol,
};

#[contractevent(topics = ["allocated"], data_format = "vec")]
struct Allocated {
    amount: i128,
    shares: i128,
}

#[contractevent(topics = ["withdrew"], data_format = "vec")]
struct Withdrew {
    amount: i128,
    shares: i128,
}

const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN"); // USDC
const POOL: Symbol = symbol_short!("POOL"); // Blend pool (or mock)
const SHARES: Symbol = symbol_short!("SHARES");
const ORACLE: Symbol = symbol_short!("ORACLE");

/// StrategyAdapter deploys idle USDC into a Blend lending pool (variable yield).
/// It tracks pool shares and accrues variable yield back into the vault.
#[contract]
pub struct StrategyAdapter;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StrategyState {
    pub shares: i128,
    pub principal: i128,
    pub last_accrue_ts: u64,
}

#[contractimpl]
impl StrategyAdapter {
    pub fn init(env: Env, admin: Address, token: Address, pool: Address, oracle: Address) {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&POOL, &pool);
        env.storage().instance().set(&ORACLE, &oracle);
        env.storage().instance().set(
            &SHARES,
            &StrategyState {
                shares: 0,
                principal: 0,
                last_accrue_ts: env.ledger().timestamp(),
            },
        );
    }

    // ---------- admin ----------

    pub fn set_pool(env: Env, pool: Address) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().instance().set(&POOL, &pool);
    }

    // ---------- vault-facing ----------

    /// Called by PositionSettlement: pull `amount` USDC from vault and deposit
    /// into the pool, minting pool shares.
    pub fn allocate(env: Env, vault: Address, amount: i128) -> i128 {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if vault != admin {
            // Only a registered vault (admin of the strategy) may allocate.
            admin.require_auth();
        }
        if amount <= 0 {
            panic!("strategy-adapter: amount must be positive");
        }
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let pool: Address = env.storage().instance().get(&POOL).unwrap();

        // Pull USDC from the vault (transfer_from spender = this adapter).
        let _: () = env.invoke_contract(
            &token,
            &Symbol::new(&env, "transfer_from"),
            (
                env.current_contract_address(),
                vault.clone(),
                env.current_contract_address(),
                amount,
            )
                .into_val(&env),
        );

        // Deposit into the pool.
        let _: i128 = env.invoke_contract(
            &pool,
            &symbol_short!("deposit"),
            (env.current_contract_address(), amount).into_val(&env),
        );

        let mut state: StrategyState = env.storage().instance().get(&SHARES).unwrap();
        state.shares += amount;
        state.principal += amount;
        state.last_accrue_ts = env.ledger().timestamp();
        env.storage().instance().set(&SHARES, &state);

        Allocated {
            amount,
            shares: state.shares,
        }
        .publish(&env);
        amount
    }

    /// Called by PositionSettlement: withdraw `amount` USDC-equivalent from the
    /// pool and transfer it back to the vault.
    pub fn withdraw(env: Env, vault: Address, amount: i128) -> i128 {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if vault != admin {
            admin.require_auth();
        }
        if amount <= 0 {
            panic!("strategy-adapter: amount must be positive");
        }
        let mut state: StrategyState = env.storage().instance().get(&SHARES).unwrap();
        if state.shares < amount {
            panic!("strategy-adapter: insufficient shares");
        }
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let pool: Address = env.storage().instance().get(&POOL).unwrap();

        // Redeem from the pool back to this adapter.
        let _: i128 = env.invoke_contract(
            &pool,
            &symbol_short!("withdraw"),
            (env.current_contract_address(), amount).into_val(&env),
        );

        // Transfer to the vault.
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (env.current_contract_address(), vault.clone(), amount).into_val(&env),
        );

        state.shares -= amount;
        state.last_accrue_ts = env.ledger().timestamp();
        env.storage().instance().set(&SHARES, &state);
        Withdrew {
            amount,
            shares: state.shares,
        }
        .publish(&env);
        amount
    }

    /// Total USDC-equivalent value held in the strategy (principal + accrued).
    pub fn total_vaulted(env: Env) -> i128 {
        let state: StrategyState = env.storage().instance().get(&SHARES).unwrap();
        let pool: Address = env.storage().instance().get(&POOL).unwrap();
        let pool_value: i128 = env.invoke_contract::<i128>(
            &pool,
            &Symbol::new(&env, "total_assets"),
            ().into_val(&env),
        );
        pool_value.min(state.principal * 2).max(0)
    }

    /// Report the variable rate to the oracle hub for the VAMM mark-to-market.
    pub fn sync_rate(env: Env) -> i128 {
        let oracle: Address = env.storage().instance().get(&ORACLE).unwrap();
        let pool: Address = env.storage().instance().get(&POOL).unwrap();
        let rate: i128 = env.invoke_contract(&pool, &symbol_short!("rate"), ().into_val(&env));
        let round: u64 = env.ledger().sequence() as u64;
        let _: () = env.invoke_contract(
            &oracle,
            &Symbol::new(&env, "report_variable_rate"),
            (env.current_contract_address(), pool.clone(), rate, round).into_val(&env),
        );
        rate
    }

    pub fn state(env: Env) -> StrategyState {
        env.storage().instance().get(&SHARES).unwrap()
    }
}
