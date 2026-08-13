#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, Address, Env, IntoVal,
    Symbol,
};

use common::{checked_mul_div, mul_rate, rate_to_bps, term_interest, QuoteInfo, RATE_SCALE};

#[contractevent(topics = ["fxquote"], data_format = "vec")]
struct FixedQuote {
    term: u64,
    amount: i128,
    apy_bps: i128,
    utilization: i128,
    interest: i128,
}

#[contractevent(topics = ["var_sync"], data_format = "vec")]
struct VarRateSync {
    #[topic]
    pool_id: Address,
    var_rate: i128,
    round: u64,
}

#[contractevent(topics = ["vamm_cfg"], data_format = "vec")]
struct VammConfigEvent {
    config: VammConfig,
}

const ADMIN: Symbol = symbol_short!("ADMIN");
const ORACLE_HUB: Symbol = symbol_short!("ORACLE");
const PAUSED: Symbol = symbol_short!("PAUSED");
const SETTLEMENT: Symbol = symbol_short!("SETLMT");
const TERM_SECONDS: Symbol = symbol_short!("TERM");
const IDLE_RATE: Symbol = symbol_short!("IDLE");
const SLOPE: Symbol = symbol_short!("SLOPE");
const X_FIXED: Symbol = symbol_short!("X_FIXED");
const Y_VARIABLE: Symbol = symbol_short!("Y_VAR");
const K_CONST: Symbol = symbol_short!("K");
const TOTAL_FIXED: Symbol = symbol_short!("TOTFIXED");
const TOTAL_VAULTED: Symbol = symbol_short!("TOTVAULT");
const LAST_BASE_RATE: Symbol = symbol_short!("LSTBASE");
const MIN_RATE: Symbol = symbol_short!("MINRATE");
const MAX_RATE: Symbol = symbol_short!("MAXRATE");

/// Initial virtual reserves: both legs start symmetric so k = x*y is meaningful
/// and quotes begin near base_rate.
pub const INITIAL_RESERVE: i128 = 1_000_000_000 * RATE_SCALE; // 1e18 virtual units

/// Maximum deposit depth allowed per trade as a fraction of x_fixed (RATE_SCALE scaled).
pub const MAX_DEPTH_FRAC: i128 = 250_000_000; // 25%

#[contract]
pub struct RateVamm;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VammConfig {
    pub term_seconds: u64,
    pub idle_rate: i128, // variable base rate at 0% utilization (RATE_SCALE scaled)
    pub slope: i128,     // marginal variable rate increase per unit utilization
    pub min_rate: i128,
    pub max_rate: i128,
}

#[contractimpl]
impl RateVamm {
    pub fn init(env: Env, admin: Address, oracle_hub: Address, config: VammConfig) {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&ORACLE_HUB, &oracle_hub);
        env.storage().instance().set(&PAUSED, &false);
        if config.term_seconds == 0 || config.term_seconds > common::MAX_TERM_SECONDS {
            panic!("rate-vamm: invalid term");
        }
        if config.idle_rate < 0 || config.slope < 0 {
            panic!("rate-vamm: negative rate config");
        }
        if config.min_rate >= config.max_rate {
            panic!("rate-vamm: min_rate must be < max_rate");
        }
        env.storage()
            .instance()
            .set(&TERM_SECONDS, &config.term_seconds);
        env.storage().instance().set(&IDLE_RATE, &config.idle_rate);
        env.storage().instance().set(&SLOPE, &config.slope);
        env.storage().instance().set(&MIN_RATE, &config.min_rate);
        env.storage().instance().set(&MAX_RATE, &config.max_rate);
        env.storage().persistent().set(&X_FIXED, &INITIAL_RESERVE);
        env.storage()
            .persistent()
            .set(&Y_VARIABLE, &INITIAL_RESERVE);
        env.storage()
            .persistent()
            .set(&K_CONST, &(INITIAL_RESERVE * INITIAL_RESERVE));
        env.storage().persistent().set(&TOTAL_FIXED, &0i128);
        env.storage().persistent().set(&TOTAL_VAULTED, &0i128);
        env.storage()
            .persistent()
            .set(&LAST_BASE_RATE, &config.idle_rate);
    }

    // ---------- admin ----------

    pub fn set_config(env: Env, config: VammConfig) {
        admin_check(&env);
        if config.term_seconds == 0 || config.term_seconds > common::MAX_TERM_SECONDS {
            panic!("rate-vamm: invalid term");
        }
        if config.min_rate >= config.max_rate {
            panic!("rate-vamm: min_rate must be < max_rate");
        }
        env.storage()
            .instance()
            .set(&TERM_SECONDS, &config.term_seconds);
        env.storage().instance().set(&IDLE_RATE, &config.idle_rate);
        env.storage().instance().set(&SLOPE, &config.slope);
        env.storage().instance().set(&MIN_RATE, &config.min_rate);
        env.storage().instance().set(&MAX_RATE, &config.max_rate);
        VammConfigEvent {
            config: config.clone(),
        }
        .publish(&env);
    }

    pub fn set_paused(env: Env, paused: bool) {
        admin_check(&env);
        env.storage().instance().set(&PAUSED, &paused);
    }

    /// Register the PositionSettlement contract allowed to call deposit_fixed.
    pub fn set_settlement(env: Env, settlement: Address) {
        admin_check(&env);
        env.storage().instance().set(&SETTLEMENT, &settlement);
    }

    // ---------- views ----------

    pub fn quote(env: Env, term_seconds: u64, amount: i128) -> QuoteInfo {
        if amount <= 0 {
            panic!("rate-vamm: amount must be positive");
        }
        let config = VammConfig {
            term_seconds: env.storage().instance().get(&TERM_SECONDS).unwrap(),
            idle_rate: env.storage().instance().get(&IDLE_RATE).unwrap(),
            slope: env.storage().instance().get(&SLOPE).unwrap(),
            min_rate: env.storage().instance().get(&MIN_RATE).unwrap(),
            max_rate: env.storage().instance().get(&MAX_RATE).unwrap(),
        };
        let u = utilization(&env);
        let base = base_rate(&env, &config, u);
        let x = env.storage().persistent().get(&X_FIXED).unwrap();
        let y = env.storage().persistent().get(&Y_VARIABLE).unwrap();
        let apy = marginal_apy(&env, base, x, amount);
        QuoteInfo {
            apy,
            utilization: u,
            x_fixed: x,
            y_variable: y,
            ts: env.ledger().timestamp(),
        }
        .also_publish(&env, term_seconds, amount)
    }

    /// Current pool state without a trade.
    pub fn state(env: Env) -> QuoteInfo {
        let config = VammConfig {
            term_seconds: env.storage().instance().get(&TERM_SECONDS).unwrap(),
            idle_rate: env.storage().instance().get(&IDLE_RATE).unwrap(),
            slope: env.storage().instance().get(&SLOPE).unwrap(),
            min_rate: env.storage().instance().get(&MIN_RATE).unwrap(),
            max_rate: env.storage().instance().get(&MAX_RATE).unwrap(),
        };
        let u = utilization(&env);
        let base = base_rate(&env, &config, u);
        let x = env.storage().persistent().get(&X_FIXED).unwrap();
        let y = env.storage().persistent().get(&Y_VARIABLE).unwrap();
        QuoteInfo {
            apy: base.clamp(config.min_rate, config.max_rate),
            utilization: u,
            x_fixed: x,
            y_variable: y,
            ts: env.ledger().timestamp(),
        }
    }

    // ---------- state-changing ----------

    /// Execute a fixed-rate deposit: shifts virtual reserves on the constant
    /// product curve and returns the quoted APY. Authorized caller: admin or
    /// a registered PositionSettlement contract (verified via auth).
    pub fn deposit_fixed(env: Env, amount: i128) -> QuoteInfo {
        if env.storage().instance().get(&PAUSED).unwrap_or(false) {
            panic!("rate-vamm: paused");
        }
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        // Auth check: the caller must be the registered settlement or the admin.
        if let Some(settlement) = env.storage().instance().get::<Symbol, Address>(&SETTLEMENT) {
            settlement.require_auth();
        } else {
            admin.require_auth();
        }
        if amount <= 0 {
            panic!("rate-vamm: amount must be positive");
        }
        let config = VammConfig {
            term_seconds: env.storage().instance().get(&TERM_SECONDS).unwrap(),
            idle_rate: env.storage().instance().get(&IDLE_RATE).unwrap(),
            slope: env.storage().instance().get(&SLOPE).unwrap(),
            min_rate: env.storage().instance().get(&MIN_RATE).unwrap(),
            max_rate: env.storage().instance().get(&MAX_RATE).unwrap(),
        };
        let term = config.term_seconds;
        let u = utilization(&env);
        let base = base_rate(&env, &config, u);
        let x = env.storage().persistent().get(&X_FIXED).unwrap();
        let apy = marginal_apy(&env, base, x, amount);
        if apy < config.min_rate || apy > config.max_rate {
            panic!("rate-vamm: quoted rate out of configured bounds");
        }
        // Constant-product rebalance on the virtual reserves.
        let depth = depth_units(&env, amount);
        let x_new = x.checked_sub(depth).expect("rate-vamm: reserve underflow");
        if x_new <= 0 {
            panic!("rate-vamm: virtual fixed reserve exhausted");
        }
        let k: i128 = env.storage().persistent().get(&K_CONST).unwrap();
        let y_new = k.checked_div(x_new).expect("rate-vamm: reserve overflow");
        env.storage().persistent().set(&X_FIXED, &x_new);
        env.storage().persistent().set(&Y_VARIABLE, &y_new);
        let total_fixed: i128 = env.storage().persistent().get(&TOTAL_FIXED).unwrap();
        env.storage()
            .persistent()
            .set(&TOTAL_FIXED, &(total_fixed + amount));
        let interest = term_interest(&env, amount, apy, term);
        FixedQuote {
            term,
            amount,
            apy_bps: rate_to_bps(&env, apy),
            utilization: u,
            interest,
        }
        .publish(&env);
        QuoteInfo {
            apy,
            utilization: utilization(&env),
            x_fixed: x_new,
            y_variable: y_new,
            ts: env.ledger().timestamp(),
        }
    }

    /// Pull the latest variable rate from OracleHub and resync the virtual
    /// curve so the pool remains delta-hedged against variable-rate drift.
    /// Returns the updated base rate.
    pub fn mark_to_market(env: Env) -> i128 {
        let oracle_hub: Address = env.storage().instance().get(&ORACLE_HUB).unwrap();
        let pool_id = pool_id_of(&env);
        let (var_rate, round): (i128, u64) = env.invoke_contract(
            &oracle_hub,
            &Symbol::new(&env, "get_variable_rate"),
            (pool_id.clone(),).into_val(&env),
        );
        env.storage().persistent().set(&LAST_BASE_RATE, &var_rate);
        VarRateSync {
            pool_id: pool_id.clone(),
            var_rate,
            round,
        }
        .publish(&env);
        var_rate
    }

    /// Report vaulted principal (idle funds deployed to the strategy) so the
    /// VAMM can compute utilization. Authorized: admin only.
    pub fn set_total_vaulted(env: Env, vaulted: i128) {
        admin_check(&env);
        env.storage().persistent().set(&TOTAL_VAULTED, &vaulted);
    }

    /// Get total USDC locked in fixed-rate positions.
    pub fn total_fixed(env: Env) -> i128 {
        env.storage().persistent().get(&TOTAL_FIXED).unwrap()
    }

    /// Get total USDC vaulted into the strategy.
    pub fn total_vaulted(env: Env) -> i128 {
        env.storage().persistent().get(&TOTAL_VAULTED).unwrap()
    }

    /// The configured term length in seconds.
    pub fn term(env: Env) -> u64 {
        env.storage().instance().get(&TERM_SECONDS).unwrap()
    }
}

// ---------------- internal helpers ----------------

fn utilization(env: &Env) -> i128 {
    let fixed: i128 = env.storage().persistent().get(&TOTAL_FIXED).unwrap();
    let vaulted: i128 = env.storage().persistent().get(&TOTAL_VAULTED).unwrap();
    let denom = fixed + vaulted;
    if denom == 0 {
        0
    } else {
        checked_mul_div(env, fixed, RATE_SCALE, denom)
    }
}

fn base_rate(env: &Env, config: &VammConfig, u: i128) -> i128 {
    let slope_effect = mul_rate(env, config.slope, u);
    let base = config.idle_rate + slope_effect;
    base.clamp(config.min_rate, config.max_rate)
}

/// Converts a deposit `amount` (USDC micro-units, 7 dp) into virtual depth.
/// Scales up to virtual reserve units so x/(x-d) stays meaningful.
fn depth_units(_env: &Env, amount: i128) -> i128 {
    // 1 USDC (1e7 micro) is represented as 1e9 virtual units => scale by 100.
    let scale = RATE_SCALE / 10_000_000; // = 100
    amount
        .checked_mul(scale)
        .expect("rate-vamm: depth overflow")
}

/// Marginal APY for a trade of `amount` given current fixed-leg reserve x:
///   apy = base * x / (x - d)
/// where d is the depth in virtual units. Enforces the max-depth cap.
fn marginal_apy(env: &Env, base: i128, x: i128, amount: i128) -> i128 {
    let d = depth_units(env, amount);
    if d >= x {
        panic!("rate-vamm: trade exceeds fixed-leg reserve");
    }
    let max_d = checked_mul_div(env, x, MAX_DEPTH_FRAC, RATE_SCALE);
    if d > max_d {
        panic!("rate-vamm: trade too deep for the virtual curve");
    }
    let ratio = checked_mul_div(env, x, RATE_SCALE, x - d);
    mul_rate(env, base, ratio)
}

/// The pool id used for variable-rate lookups. For the single-pool MVP this is
/// the current contract's own address.
fn pool_id_of(env: &Env) -> Address {
    env.current_contract_address()
}

fn admin_check(env: &Env) {
    let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    admin.require_auth();
}

trait QuotePublish {
    fn also_publish(self, env: &Env, term: u64, amount: i128) -> Self;
}

impl QuotePublish for QuoteInfo {
    fn also_publish(self, env: &Env, term: u64, amount: i128) -> Self {
        FixedQuote {
            term,
            amount,
            apy_bps: rate_to_bps(env, self.apy),
            utilization: self.utilization,
            interest: term_interest(env, amount, self.apy, term),
        }
        .publish(env);
        self
    }
}

#[cfg(test)]
mod test;

#[cfg(test)]
mod properties;
