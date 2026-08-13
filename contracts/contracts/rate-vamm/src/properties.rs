#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::Env;

use crate::*;

proptest! {
    /// Deeper trades and higher base rates both price up, never down.
    #[test]
    fn marginal_apy_monotone_in_amount_and_base(
        base in 1u64..(RATE_SCALE as u64),
    ) {
        let env = Env::default();
        let base = base as i128;
        let x = INITIAL_RESERVE;
        let small = 1_000_000i128; // 0.1 USDC
        let large = 1_000_000_000i128; // 100 USDC

        let a = marginal_apy(&env, base, x, small);
        let b = marginal_apy(&env, base, x, large);
        prop_assert!(b >= a, "deeper trade must cost >= smaller trade");
        prop_assert!(a >= base, "marginal apy must never be below base rate");

        let higher = marginal_apy(&env, base * 2, x, small);
        prop_assert!(higher >= a, "raising base rate must not lower marginal apy");
    }

    /// Base rate is always clamped to the configured [min_rate, max_rate] band.
    #[test]
    fn base_rate_stays_within_bounds(
        idle_rate in 0i128..RATE_SCALE,
        slope in 0i128..RATE_SCALE,
        u in 0i128..=RATE_SCALE,
    ) {
        let env = Env::default();
        let config = VammConfig {
            term_seconds: common::DAY_SECONDS * 30,
            idle_rate,
            slope,
            min_rate: RATE_SCALE / 100,
            max_rate: RATE_SCALE / 4,
        };
        let r = base_rate(&env, &config, u);
        prop_assert!(
            (RATE_SCALE / 100..=RATE_SCALE / 4).contains(&r)
        );
    }

    /// Simple-interest payout matches principal * apy * term / (RATE_SCALE * YEAR).
    #[test]
    fn interest_matches_simple_interest_formula(
        principal in 1_000_000i128..1_000_000_000_000i128,
        apy in 0i128..RATE_SCALE,
        term in 1u64..(common::DAY_SECONDS * 400),
    ) {
        let env = Env::default();
        let interest = term_interest(&env, principal, apy, term);
        prop_assert!(interest >= 0);
        let expected = principal * apy * term as i128 / (RATE_SCALE * common::YEAR_SECONDS as i128);
        // Two chained fixed-point divs can round by up to a couple of units.
        let tol = (principal * apy / RATE_SCALE).max(1) + 2;
        prop_assert!(
            (interest - expected).abs() <= tol,
            "interest {} != expected {} (tol {})",
            interest,
            expected,
            tol
        );
    }

    /// checked_mul_div is commutative in the numerator and rounds by at most one.
    #[test]
    fn checked_mul_div_commutes_and_bounds(
        a in 0i128..=RATE_SCALE,
        b in 0i128..=RATE_SCALE,
        c in 1i128..=RATE_SCALE,
    ) {
        let env = Env::default();
        let ab = checked_mul_div(&env, a, b, c);
        let ba = checked_mul_div(&env, b, a, c);
        prop_assert_eq!(ab, ba, "mul_div must commute in numerator");
        prop_assert!((ab - a * b / c).abs() <= 1, "at most one unit of rounding");
    }

    /// No-free-lunch: rebalancing preserves the constant product x*y == k
    /// (up to floor rounding) and the variable leg grows as fixed leg shrinks.
    #[test]
    fn constant_product_preserved(
        amount in 1_000u64..((INITIAL_RESERVE / (100 * 4)) as u64),
    ) {
        let env = Env::default();
        let x = INITIAL_RESERVE;
        let y = INITIAL_RESERVE;
        let k = x * y;
        let d = depth_units(&env, amount as i128);
        if d >= x {
            return Ok(());
        }
        let x_new = x - d;
        let y_new = k / x_new;
        prop_assert!((x_new * y_new - k).abs() < x_new);
        prop_assert!(y_new >= y, "variable leg must grow as fixed leg shrinks");
    }
}
