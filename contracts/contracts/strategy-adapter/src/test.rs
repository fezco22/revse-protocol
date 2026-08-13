#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env};

use crate::*;

fn deploy(
    env: &Env,
    vault: Address,
) -> (
    StrategyAdapterClient<'_>,
    Address,
    StellarAssetClient<'_>,
    mock_pool::MockPoolClient<'_>,
    oracle_hub::OracleHubClient<'_>,
) {
    let token = env
        .register_stellar_asset_contract_v2(vault.clone())
        .address();
    let tc = StellarAssetClient::new(env, &token);
    let id = env.register(StrategyAdapter, ());
    let client = StrategyAdapterClient::new(env, &id);

    let pool_id = env.register(mock_pool::MockPool, ());
    let pool_client = mock_pool::MockPoolClient::new(env, &pool_id);
    pool_client.init(
        &id, // pool admin == strategy (its operator)
        &token,
        &(common::RATE_SCALE / 50),
        &(common::RATE_SCALE / 2),
    );
    let oracle_id = env.register(oracle_hub::OracleHub, ());
    let oracle_client = oracle_hub::OracleHubClient::new(env, &oracle_id);
    oracle_client.init(&vault.clone(), &(60 * 60));

    client.init(&vault, &token, &pool_id, &oracle_id);
    (client, token, tc, pool_client, oracle_client)
}

fn approve(tc: &StellarAssetClient, holder: &Address, spender: &Address, amount: i128) {
    tc.approve(holder, spender, &amount, &5_000_000u32);
}

#[test]
fn allocate_deploys_idle_to_pool_and_returns_principal() {
    let env = Env::default();
    env.mock_all_auths();
    let vault = Address::generate(&env);
    let (client, token, tc, pool_client, _oracle) = deploy(&env, vault.clone());

    tc.mint(&vault, &1_000_000_000);
    // Strategy pulls from vault; pool pulls from strategy.
    approve(&tc, &vault, &client.address.clone(), 200_000_000_000i128);
    approve(
        &tc,
        &client.address.clone(),
        &pool_client.address.clone(),
        200_000_000_000i128,
    );
    assert_eq!(pool_client.total_assets(), 0);

    let amount = 400_000_000i128;
    let got = client.allocate(&vault, &amount);
    assert_eq!(got, amount);
    let st = client.state();
    assert_eq!(st.shares, amount);
    assert_eq!(st.principal, amount);
    assert_eq!(pool_client.total_assets(), amount);
    assert_eq!(tc.balance(&vault), 600_000_000);
    assert_eq!(client.total_vaulted(), amount);
    let _ = token;
}

#[test]
fn withdraw_redeems_and_returns_to_vault() {
    let env = Env::default();
    env.mock_all_auths();
    let vault = Address::generate(&env);
    let (client, _token, tc, pool_client, _oracle) = deploy(&env, vault.clone());

    tc.mint(&vault, &1_000_000_000);
    approve(&tc, &vault, &client.address.clone(), 200_000_000_000i128);
    approve(
        &tc,
        &client.address.clone(),
        &pool_client.address.clone(),
        200_000_000_000i128,
    );
    client.allocate(&vault, &300_000_000);
    let returned = client.withdraw(&vault, &100_000_000);
    assert_eq!(returned, 100_000_000);
    assert_eq!(tc.balance(&vault), 800_000_000);
    assert_eq!(client.state().shares, 200_000_000);
    assert_eq!(pool_client.total_assets(), 200_000_000);

    assert!(client.try_withdraw(&vault, &500_000_000).is_err());
}

#[test]
fn sync_rate_reports_to_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let vault = Address::generate(&env);
    let (client, _token, tc, pool_client, oracle_client) = deploy(&env, vault.clone());
    tc.mint(&vault, &1_000_000_000);
    oracle_client.set_reporter(&client.address.clone(), &true);

    let r = client.sync_rate();
    let pool_id = pool_client.address.clone();
    let (reported, _round) = oracle_client.get_variable_rate(&pool_id);
    assert_eq!(r, reported);

    pool_client.set_pool_rate(&(common::RATE_SCALE / 10), &(common::RATE_SCALE / 4));
    let r2 = client.sync_rate();
    assert_eq!(r2, common::RATE_SCALE / 10);
}

#[test]
fn only_vault_can_allocate() {
    let env = Env::default();
    let vault = Address::generate(&env);
    let attacker = Address::generate(&env);
    let (client, _token, _tc, _pool, _oracle) = deploy(&env, vault);
    // No auth signed: caller != vault fails.
    assert!(client.try_allocate(&attacker, &1_000_000).is_err());
}
