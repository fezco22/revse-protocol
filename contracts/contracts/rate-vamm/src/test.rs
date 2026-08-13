#![cfg(test)]

use soroban_sdk::testutils::{Address as _, Events as _};
use soroban_sdk::{Address, Env};

use crate::*;

pub fn deploy_vamm(env: &Env, admin: Address, oracle_hub: Address) -> RateVammClient<'_> {
    let contract_id = env.register(RateVamm, ());
    let client = RateVammClient::new(env, &contract_id);
    client.init(
        &admin,
        &oracle_hub,
        &VammConfig {
            term_seconds: common::DAY_SECONDS * 30,
            idle_rate: RATE_SCALE / 20, // 5%
            slope: RATE_SCALE / 2,      // 50% at 100% utilization
            min_rate: RATE_SCALE / 100, // 1%
            max_rate: RATE_SCALE / 4,   // 25%
        },
    );
    client
}

fn bad_config(term: u64) -> VammConfig {
    VammConfig {
        term_seconds: term,
        idle_rate: RATE_SCALE / 20,
        slope: RATE_SCALE / 2,
        min_rate: RATE_SCALE / 100,
        max_rate: RATE_SCALE / 4,
    }
}

/// A deposit of one USDC becomes 100 virtual units of depth.
#[test]
fn depth_units_scales_usdc_to_virtual_units() {
    let env = Env::default();
    assert_eq!(depth_units(&env, 1_000_000), 100_000_000); // 1 USDC * 100
    assert_eq!(depth_units(&env, 10_000_000), 1_000_000_000); // 10 USDC
}

#[test]
fn init_rejects_bad_config() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let contract_id = env.register(RateVamm, ());
    let client = RateVammClient::new(&env, &contract_id);

    // min_rate >= max_rate.
    let cfg = bad_config(common::DAY_SECONDS * 30);
    let cfg = VammConfig {
        min_rate: RATE_SCALE / 4,
        max_rate: RATE_SCALE / 100,
        ..cfg
    };
    assert!(client.try_init(&admin, &oracle, &cfg).is_err());

    // term 0.
    assert!(client.try_init(&admin, &oracle, &bad_config(0)).is_err());
}

#[test]
fn quote_is_bounded_by_min_max_rate() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    let q = client.quote(&(common::DAY_SECONDS * 30), &1_000_000_000);
    assert!(q.apy >= RATE_SCALE / 100);
    assert!(q.apy <= RATE_SCALE / 4);
    assert_eq!(q.utilization, 0);
    assert_eq!(q.x_fixed, INITIAL_RESERVE);
}

#[test]
fn deeper_trades_quote_higher_apy() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    let small = client.quote(&(common::DAY_SECONDS * 30), &100_000_000); // 10 USDC
    let big = client.quote(&(common::DAY_SECONDS * 30), &1_000_000_000); // 100 USDC
    assert!(big.apy > small.apy, "deeper trade must quote a higher rate");
}

#[test]
fn deposit_fixed_moves_reserves_on_constant_product() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    let before_x = client.state().x_fixed;
    let before_y = client.state().y_variable;
    let k = before_x * before_y;

    let amount = 100_000_000i128; // 10 USDC
    let q = client.deposit_fixed(&amount);
    let after_x = client.state().x_fixed;
    let after_y = client.state().y_variable;

    assert!(after_x < before_x);
    assert!(after_y > before_y);
    assert!(
        (after_x * after_y - k).abs() < after_x,
        "constant product must be preserved"
    );
    assert_eq!(client.total_fixed(), amount);
    assert_eq!(q.x_fixed, after_x);
    assert_eq!(q.y_variable, after_y);
}

#[test]
fn deposit_fixed_enforces_depth_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    // Depth cap is 25% of x. INITIAL_RESERVE = 1e18 virtual units (1e16 depth
    // cap => 1e14 USDC micro-units). Anything beyond must panic.
    let too_deep = (INITIAL_RESERVE / 10_000 * RATE_SCALE) + 1;
    assert!(
        client.try_deposit_fixed(&too_deep).is_err(),
        "over-cap trade must be rejected"
    );
}

#[test]
fn deposit_fixed_requires_admin_or_settlement_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    // No auth signed and no settlement registered => must fail.
    assert!(
        client.try_deposit_fixed(&1_000_000).is_err(),
        "deposit_fixed must require auth"
    );
}

#[test]
fn set_total_vaulted_updates_utilization() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    assert_eq!(client.state().utilization, 0);
    client.set_total_vaulted(&1_000_000_000);
    client.deposit_fixed(&1_000_000_000);
    let expected = 1_000_000_000 * RATE_SCALE / (1_000_000_000 + 1_000_000_000);
    assert_eq!(client.state().utilization, expected);
    assert_eq!(client.total_vaulted(), 1_000_000_000);
}

#[test]
fn mark_to_market_pulls_variable_rate_from_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle_id = env.register(oracle_hub::OracleHub, ());
    let oracle_client = oracle_hub::OracleHubClient::new(&env, &oracle_id);
    oracle_client.init(&admin, &(60 * 60));

    let client = deploy_vamm(&env, admin.clone(), oracle_id);
    let pool_id = client.address.clone();
    oracle_client.report_variable_rate(&admin, &pool_id, &(RATE_SCALE / 10), &1);
    let r = client.mark_to_market();
    assert_eq!(r, RATE_SCALE / 10);
}

#[test]
fn term_returns_configured_seconds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);
    assert_eq!(client.term(), common::DAY_SECONDS * 30);
}

#[test]
fn vamm_emits_fxquote_event_on_deposit() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let client = deploy_vamm(&env, admin, oracle);

    client.deposit_fixed(&1_000_000_000);
    let events = env.events().all().filter_by_contract(&client.address);
    assert!(
        !events.events().is_empty(),
        "expected vamm events on deposit"
    );
}
