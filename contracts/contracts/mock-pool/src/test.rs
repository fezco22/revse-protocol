#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env};

use crate::*;

fn deploy(env: &Env, admin: Address) -> (MockPoolClient<'_>, Address, StellarAssetClient<'_>) {
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_client = StellarAssetClient::new(env, &token);
    let id = env.register(MockPool, ());
    let client = MockPoolClient::new(env, &id);
    client.init(&admin, &token, &(RATE_SCALE / 50), &(RATE_SCALE / 2)); // 2% idle, 50% slope
    (client, token, token_client)
}

fn approve(token_client: &StellarAssetClient, holder: &Address, spender: &Address, amount: i128) {
    // The pool pulls USDC via transfer_from (spender == pool), so the holder must pre-approve it.
    token_client.approve(holder, spender, &amount, &5_000_000u32);
}

#[test]
fn deposit_withdraw_roundtrip() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let holder = Address::generate(&env);
    let (client, _token, token_client) = deploy(&env, admin.clone());

    token_client.mint(&holder, &1_000_000_000);
    approve(
        &token_client,
        &holder,
        &client.address.clone(),
        1_000_000_000,
    );

    assert_eq!(client.deposit(&holder, &400_000_000), 400_000_000);
    assert_eq!(client.total_assets(), 400_000_000);
    assert_eq!(token_client.balance(&holder), 600_000_000);

    // Withdraw back to an arbitrary recipient.
    let recipient = Address::generate(&env);
    client.withdraw(&recipient, &150_000_000);
    assert_eq!(client.total_assets(), 250_000_000);
    assert_eq!(token_client.balance(&recipient), 150_000_000);
}

#[test]
fn rate_tracks_idle_plus_utilization_proxy() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let holder = Address::generate(&env);
    let (client, _token, token_client) = deploy(&env, admin.clone());

    assert_eq!(client.rate(), RATE_SCALE / 50); // 2% with no deposits

    // Push deposits up the utilization proxy: rate must rise.
    token_client.mint(&holder, &1_000_000_000);
    approve(
        &token_client,
        &holder,
        &client.address.clone(),
        1_000_000_000,
    );
    let _ = client.deposit(&holder, &1_000_000_000);
    let r_after = client.rate();
    assert!(r_after > RATE_SCALE / 50);

    // Admin can override the pool curve; rate follows idle upwards again.
    client.set_pool_rate(&(RATE_SCALE / 10), &(RATE_SCALE / 4));
    let r_override = client.rate();
    assert!(r_override > RATE_SCALE / 10, "override idle must lift rate");
}

#[test]
fn deposit_requires_positive_amounts_and_funds() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let holder = Address::generate(&env);
    let (client, _token, _token_client) = deploy(&env, admin.clone());

    assert!(client.try_deposit(&holder, &0).is_err());
    assert!(client.try_deposit(&holder, &-5).is_err());
    // Unfunded user: transfer_from fails.
    assert!(client.try_deposit(&holder, &1_000_000_000).is_err());
}

#[test]
fn withdraw_rejects_overdraft() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let holder = Address::generate(&env);
    let (client, _token, token_client) = deploy(&env, admin.clone());

    token_client.mint(&holder, &100_000_000);
    approve(&token_client, &holder, &client.address.clone(), 100_000_000);
    client.deposit(&holder, &100_000_000);
    assert!(client.try_withdraw(&holder, &101_000_000).is_err());
}
