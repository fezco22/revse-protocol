#![cfg(test)]

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

use crate::*;

fn deploy(env: &Env, admin: Address, minter: Address) -> FusdcClient<'_> {
    let id = env.register(Fusdc, ());
    let client = FusdcClient::new(env, &id);
    client.init(&admin, &minter, &7);
    client
}

#[test]
fn init_sets_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    assert_eq!(client.name(), String::from_str(&env, "FixedYield USDC"));
    assert_eq!(client.symbol(), String::from_str(&env, "fUSDC"));
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn mint_and_burn_roundtrip_via_minter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let user = Address::generate(&env);
    let client = deploy(&env, admin, minter.clone());

    // Without mock auth the minter is required to sign.
    client.mint(&user, &1_000_000);
    assert_eq!(client.balance(&user), 1_000_000);
    assert_eq!(client.total_supply(), 1_000_000);

    client.burn(&user, &400_000);
    assert_eq!(client.balance(&user), 600_000);
    assert_eq!(client.total_supply(), 600_000);
}

#[test]
fn mint_requires_minter_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let stranger = Address::generate(&env);
    let user = Address::generate(&env);
    let client = deploy(&env, admin, minter);
    // No mock_all_auths and no minter signature: mint must be rejected.
    assert!(client.try_mint(&user, &1_000_000).is_err());
    let _ = stranger;
}

#[test]
fn burn_rejects_overdraft() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let user = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    client.mint(&user, &1_000_000);
    assert!(client.try_burn(&user, &1_000_001).is_err());
}

#[test]
fn transfer_and_allowance_work() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    client.mint(&alice, &1_000_000_000);
    client.transfer(&alice, &bob, &200_000_000);
    assert_eq!(client.balance(&alice), 800_000_000);
    assert_eq!(client.balance(&bob), 200_000_000);

    client.approve(&alice, &bob, &100_000_000, &1_000_000);
    assert_eq!(client.allowance(&alice, &bob), 100_000_000);
    client.transfer_from(&bob, &alice, &bob, &60_000_000);
    assert_eq!(client.allowance(&alice, &bob), 40_000_000);
    assert_eq!(client.balance(&bob), 260_000_000);
}

#[test]
fn transfer_from_rejects_without_allowance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    client.mint(&alice, &1_000_000_000);
    assert!(
        client
            .try_transfer_from(&bob, &alice, &bob, &100_000)
            .is_err(),
        "transfer without allowance must fail"
    );
}

#[test]
fn paused_token_rejects_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    client.mint(&alice, &1_000_000);
    client.set_paused(&true);
    assert!(client.try_transfer(&alice, &bob, &1).is_err());
    assert!(client.try_mint(&bob, &1).is_err());
    client.set_paused(&false);
    client.transfer(&alice, &bob, &1);
    assert_eq!(client.balance(&bob), 1);
}

#[test]
fn authorized_and_clawback() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let user = Address::generate(&env);
    let client = deploy(&env, admin.clone(), minter);

    client.mint(&user, &1_000_000);
    assert!(client.authorized(&user));

    client.set_authorized(&admin, &user, &false);
    assert!(!client.authorized(&user));

    client.clawback(&admin, &user, &400_000);
    assert_eq!(client.balance(&user), 600_000);
}

#[test]
fn transfer_self_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let user = Address::generate(&env);
    let client = deploy(&env, admin, minter);

    client.mint(&user, &1_000_000);
    assert!(client.try_transfer(&user, &user, &1).is_err());
}
