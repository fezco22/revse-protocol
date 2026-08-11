#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol,
};
use soroban_token_sdk::{
    events::{Approve, Burn, Clawback, Mint, Transfer},
    metadata::TokenMetadata,
    TokenUtils,
};

#[contractevent(topics = ["set_authorized"], data_format = "single-value")]
struct SetAuthorized {
    #[topic]
    admin: Address,
    #[topic]
    id: Address,
    authorize: bool,
}

const ADMIN: Symbol = symbol_short!("ADMIN");
const MINTER: Symbol = symbol_short!("MINTER");
const PAUSED: Symbol = symbol_short!("PAUSED");

// fUSDC is a fixed-yield claim token (SEP-41). It mirrors the ERC-4626 vault
// share pattern: minted 1:1 on fixed deposit, burned on maturity claim.
#[contract]
pub struct Fusdc;

#[contractimpl]
impl Fusdc {
    pub fn init(env: Env, admin: Address, minter: Address, decimals: u32) {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&MINTER, &minter);
        env.storage().instance().set(&PAUSED, &false);
        let metadata = TokenMetadata {
            decimal: decimals,
            name: String::from_str(&env, "FixedYield USDC"),
            symbol: String::from_str(&env, "fUSDC"),
        };
        TokenUtils::new(&env).metadata().set_metadata(&metadata);
    }

    // ---------- views ----------

    pub fn decimals(env: Env) -> u32 {
        TokenUtils::new(&env).metadata().get_metadata().decimal
    }

    pub fn name(env: Env) -> String {
        TokenUtils::new(&env).metadata().get_metadata().name
    }

    pub fn symbol(env: Env) -> String {
        TokenUtils::new(&env).metadata().get_metadata().symbol
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        let key = DataKey::Balance(id);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = DataKey::Allowance(from, spender);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    // ---------- minter / admin ----------

    /// Mint fUSDC to `to`. Callable only by the registered minter (RateVAMM).
    pub fn mint(env: Env, to: Address, amount: i128) {
        let minter: Address = env.storage().instance().get(&MINTER).unwrap();
        minter.require_auth();
        check_amount(amount);
        // balance == fUSDC amount
        let bal_key = DataKey::Balance(to.clone());
        let bal: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        env.storage().persistent().set(&bal_key, &(bal + amount));
        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply + amount));
        Mint {
            to: to.clone(),
            to_muxed_id: None,
            amount,
        }
        .publish(&env);
    }

    /// Burn fUSDC from `from`. Callable only by the registered minter.
    pub fn burn(env: Env, from: Address, amount: i128) {
        let minter: Address = env.storage().instance().get(&MINTER).unwrap();
        minter.require_auth();
        check_amount(amount);
        let bal_key = DataKey::Balance(from.clone());
        let bal: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        if bal < amount {
            panic!("fusdc: insufficient balance to burn");
        }
        env.storage().persistent().set(&bal_key, &(bal - amount));
        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply - amount));
        Burn {
            from: from.clone(),
            amount,
        }
        .publish(&env);
    }

    pub fn set_minter(env: Env, minter: Address) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().instance().set(&MINTER, &minter);
    }

    pub fn set_paused(env: Env, paused: bool) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().instance().set(&PAUSED, &paused);
    }

    // ---------- SEP-41 transfers ----------

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        check_amount(amount);
        if env.storage().instance().get(&PAUSED).unwrap_or(false) {
            panic!("fusdc: paused");
        }
        transfer_internal(&env, from, to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        check_amount(amount);
        if env.storage().instance().get(&PAUSED).unwrap_or(false) {
            panic!("fusdc: paused");
        }
        let allow_key = DataKey::Allowance(from.clone(), spender.clone());
        let allowance: i128 = env.storage().persistent().get(&allow_key).unwrap_or(0);
        if allowance < amount {
            panic!("fusdc: insufficient allowance");
        }
        env.storage()
            .persistent()
            .set(&allow_key, &(allowance - amount));
        transfer_internal(&env, from, to, amount);
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        from.require_auth();
        check_amount(amount);
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from.clone(), spender.clone()), &amount);
        Approve {
            from: from.clone(),
            spender: spender.clone(),
            amount,
            expiration_ledger,
        }
        .publish(&env);
    }

    pub fn set_authorized(env: Env, admin: Address, id: Address, authorize: bool) {
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Authorized(id.clone()), &authorize);
        SetAuthorized {
            admin: admin.clone(),
            id: id.clone(),
            authorize,
        }
        .publish(&env);
    }

    pub fn authorized(env: Env, id: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Authorized(id))
            .unwrap_or(true)
    }

    /// Force-transfer for protocol operations (liquidation sweeps).
    pub fn clawback(env: Env, admin: Address, from: Address, amount: i128) {
        admin.require_auth();
        check_amount(amount);
        let bal_key = DataKey::Balance(from.clone());
        let bal: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        if bal < amount {
            panic!("fusdc: insufficient balance to clawback");
        }
        env.storage().persistent().set(&bal_key, &(bal - amount));
        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply - amount));
        Clawback {
            from: from.clone(),
            amount,
        }
        .publish(&env);
    }
}

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Allowance(Address, Address),
    TotalSupply,
    Authorized(Address),
}

fn transfer_internal(env: &Env, from: Address, to: Address, amount: i128) {
    if from == to {
        panic!("fusdc: cannot transfer to self");
    }
    let from_key = DataKey::Balance(from.clone());
    let to_key = DataKey::Balance(to.clone());
    let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
    if from_bal < amount {
        panic!("fusdc: insufficient balance");
    }
    let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
    env.storage()
        .persistent()
        .set(&from_key, &(from_bal - amount));
    env.storage().persistent().set(&to_key, &(to_bal + amount));
    Transfer {
        from: from.clone(),
        to: to.clone(),
        to_muxed_id: None,
        amount,
    }
    .publish(env);
}

fn check_amount(amount: i128) {
    if amount < 0 {
        panic!("fusdc: negative amount");
    }
}
