#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, IntoVal, Symbol};

use common::{checked_mul_div, mul_rate, RATE_SCALE};

const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN"); // USDC
const DEPOSITS: Symbol = symbol_short!("DEPOSITS");
const IDLE_RATE: Symbol = symbol_short!("IDLE");
const SLOPE: Symbol = symbol_short!("SLOPE");
const ACCRUE_TS: Symbol = symbol_short!("ACCRUE");
const ACCRUED: Symbol = symbol_short!("ACCRUED");

/// Mock variable-rate lending pool that stands in for Blend on testnet/demo.
/// Earnings accrue every ledger based on the pool's own utilization curve.
#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn init(env: Env, admin: Address, token: Address, idle_rate: i128, slope: i128) {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&IDLE_RATE, &idle_rate);
        env.storage().instance().set(&SLOPE, &slope);
        env.storage().instance().set(&DEPOSITS, &0i128);
        env.storage()
            .instance()
            .set(&ACCRUE_TS, &env.ledger().timestamp());
        env.storage().instance().set(&ACCRUED, &0i128);
    }

    /// Deposit USDC into the pool, minting pool shares 1:1.
    pub fn deposit(env: Env, from: Address, amount: i128) -> i128 {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if env.current_contract_address() != admin {
            admin.require_auth();
        }
        if amount <= 0 {
            panic!("mock-pool: amount must be positive");
        }
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let _: () = env.invoke_contract(
            &token,
            &Symbol::new(&env, "transfer_from"),
            (
                env.current_contract_address(),
                from.clone(),
                env.current_contract_address(),
                amount,
            )
                .into_val(&env),
        );
        let deposits: i128 = env.storage().instance().get(&DEPOSITS).unwrap();
        env.storage()
            .instance()
            .set(&DEPOSITS, &(deposits + amount));
        amount
    }

    /// Withdraw USDC from the pool (burning shares), returns to `to`.
    pub fn withdraw(env: Env, to: Address, amount: i128) -> i128 {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if env.current_contract_address() != admin {
            admin.require_auth();
        }
        if amount <= 0 {
            panic!("mock-pool: amount must be positive");
        }
        let deposits: i128 = env.storage().instance().get(&DEPOSITS).unwrap();
        if deposits < amount {
            panic!("mock-pool: insufficient deposits");
        }
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let _: () = env.invoke_contract(
            &token,
            &symbol_short!("transfer"),
            (env.current_contract_address(), to.clone(), amount).into_val(&env),
        );
        env.storage()
            .instance()
            .set(&DEPOSITS, &(deposits - amount));
        amount
    }

    /// Current variable APY based on utilization:
    ///   rate = idle_rate + slope * utilization
    /// Where utilization = 0 (no borrows in the mock; the curve models the
    /// variable pool's marginal rate).
    pub fn rate(env: Env) -> i128 {
        let idle: i128 = env.storage().instance().get(&IDLE_RATE).unwrap();
        let slope: i128 = env.storage().instance().get(&SLOPE).unwrap();
        let deposits: i128 = env.storage().instance().get(&DEPOSITS).unwrap();
        // Simulate utilization growing with deposits (proxy for borrow demand).
        let utilization = if deposits == 0 {
            0
        } else {
            checked_mul_div(
                &env,
                deposits,
                RATE_SCALE,
                deposits + 50_000_000 * RATE_SCALE,
            )
        };
        (idle + mul_rate(&env, slope, utilization)).clamp(0, common::MAX_RATE)
    }

    /// Total assets held by the pool (deposits). Variable yield accrues on the
    /// strategy side via `total_assets` accounting; here principal == deposits.
    pub fn total_assets(env: Env) -> i128 {
        env.storage().instance().get(&DEPOSITS).unwrap()
    }

    pub fn set_pool_rate(env: Env, idle_rate: i128, slope: i128) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().instance().set(&IDLE_RATE, &idle_rate);
        env.storage().instance().set(&SLOPE, &slope);
    }
}
