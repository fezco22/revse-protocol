#![no_std]

use soroban_sdk::{contracttype, Address, Env, Val};

// Fixed-point scaling: rates and utilization are stored scaled by RATE_SCALE.
// RATE_SCALE = 1e9  => 1.0 == 1_000_000_000, 5% == 50_000_000.
pub const RATE_SCALE: i128 = 1_000_000_000;
pub const YEAR_SECONDS: u64 = 31_557_600; // 365.25 days
pub const DAY_SECONDS: u64 = 86_400;
pub const MAX_TERM_SECONDS: u64 = 5 * YEAR_SECONDS;
pub const MAX_UTIL_RATIO: i128 = RATE_SCALE; // 100%
pub const MIN_RATE: i128 = 0;
pub const MAX_RATE: i128 = 1_000_000 * RATE_SCALE; // 100_000% safety ceiling

/// Fixed-point multiply: a * b / RATE_SCALE with overflow checks.
/// Used to compose two scaled rates without losing precision.
pub fn mul_rate(env: &Env, a: i128, b: i128) -> i128 {
    checked_mul_div(env, a, b, RATE_SCALE)
}

/// a * b / c with overflow + division-by-zero checks.
pub fn checked_mul_div(env: &Env, a: i128, b: i128, c: i128) -> i128 {
    if c == 0 {
        panic!("common: division by zero");
    }
    let result = (a.checked_mul(b))
        .and_then(|ab| ab.checked_div(c))
        .unwrap_or_else(|| panic!("common: arithmetic overflow in mul_div"));
    let _ = env;
    result
}

/// bps -> rate. 100 bps == 1% == 10_000_000 (rate scale).
pub fn bps_to_rate(env: &Env, bps: i128) -> i128 {
    checked_mul_div(env, bps, RATE_SCALE, 10_000)
}

/// rate -> bps.
pub fn rate_to_bps(env: &Env, rate: i128) -> i128 {
    checked_mul_div(env, rate, 10_000, RATE_SCALE)
}

/// Effective rate for a term: (1 + apy)^(term_seconds / YEAR_SECONDS) - 1,
/// linearized via annualized rate * term fraction (simple interest approximation).
/// For MVP the fixed APY is quoted per annum and the claim payout is
/// principal * (1 + apy * term_seconds / YEAR_SECONDS).
pub fn term_interest(env: &Env, apy: i128, term_seconds: u64) -> i128 {
    let frac = checked_mul_div(env, term_seconds as i128, RATE_SCALE, YEAR_SECONDS as i128);
    mul_rate(env, apy, frac)
}

// -------------------- Cross-contract interfaces --------------------

/// Interface consumed by RateVAMM from OracleHub.
pub trait OracleHubInterface {
    fn get_variable_rate(e: &Env, pool_id: &Address) -> (i128, u64);
    fn get_price(e: &Env, asset: &Address) -> (i128, u64);
}

/// Interface consumed by PositionSettlement from RateVAMM.
pub trait RateVammInterface {
    fn quote(e: &Env, term_seconds: u64, amount: i128) -> i128;
    fn mark_to_market(e: &Env) -> i128;
}

/// Interface consumed by StrategyAdapter into a lending pool (Blend or mock).
pub trait LendingPoolInterface {
    fn deposit(e: &Env, from: &Address, amount: i128) -> Val;
    fn withdraw(e: &Env, to: &Address, amount: i128) -> Val;
}

// -------------------- Shared types --------------------

/// A fixed-rate quote returned by the VIMM.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuoteInfo {
    /// Fixed APY quoted, scaled by RATE_SCALE (per annum).
    pub apy: i128,
    /// Utilization at quote time, scaled by RATE_SCALE.
    pub utilization: i128,
    /// Virtual fixed-leg reserve after trade.
    pub x_fixed: i128,
    /// Virtual variable-leg reserve after trade.
    pub y_variable: i128,
    /// Block timestamp of the quote.
    pub ts: u64,
}
