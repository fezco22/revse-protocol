#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, symbol_short, Address, Env, IntoVal, Map,
    Symbol, Vec,
};

use common::{checked_mul_div, RATE_SCALE};

#[contractevent(topics = ["feed_upd"], data_format = "vec")]
struct FeedUpdated {
    #[topic]
    asset: Address,
    #[topic]
    oracle: Address,
    decimals: u32,
    max_staleness: u64,
}

#[contractevent(topics = ["var_rate"], data_format = "vec")]
struct VarRateEvent {
    #[topic]
    pool_id: Address,
    rate: i128,
    ts: u64,
    round: u64,
}

#[contractevent(topics = ["osync"], data_format = "vec")]
struct OracleSync {
    #[topic]
    asset: Address,
    price: i128,
    ts: u64,
    valid: bool,
}

const ADMIN: Symbol = symbol_short!("ADMIN");
const MAX_STALENESS: Symbol = symbol_short!("MAXSTALE");
const FEEDS: Symbol = symbol_short!("FEEDS");
const VAR_RATES: Symbol = symbol_short!("VARRATES");
const REPORTERS: Symbol = symbol_short!("REPORTERS");
const PAUSED: Symbol = symbol_short!("PAUSED");

/// A registered SEP-40 price feed.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Feed {
    pub oracle: Address,
    pub decimals: u32,
    pub max_staleness: u64, // seconds
}

/// Stored variable-rate observation for a lending pool.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VarRate {
    pub rate: i128, // scaled by RATE_SCALE (per annum)
    pub ts: u64,    // ledger timestamp
    pub round: u64,
}

#[contract]
pub struct OracleHub;

#[contractimpl]
impl OracleHub {
    pub fn init(env: Env, admin: Address, max_staleness: u64) {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&MAX_STALENESS, &max_staleness);
        env.storage().instance().set(&PAUSED, &false);
    }

    // ---------- admin ----------

    /// Register (or replace) a SEP-40 oracle feed for an asset. Admin only.
    pub fn set_feed(env: Env, asset: Address, oracle: Address, decimals: u32, max_staleness: u64) {
        admin_check(&env);
        let mut feeds: Map<Address, Feed> = env
            .storage()
            .persistent()
            .get(&FEEDS)
            .unwrap_or_else(|| Map::new(&env));
        feeds.set(
            asset.clone(),
            Feed {
                oracle: oracle.clone(),
                decimals,
                max_staleness,
            },
        );
        env.storage().persistent().set(&FEEDS, &feeds);
        FeedUpdated {
            asset: asset.clone(),
            oracle: oracle.clone(),
            decimals,
            max_staleness,
        }
        .publish(&env);
    }

    /// Grant or revoke variable-rate reporting permission to an address. Admin only.
    pub fn set_reporter(env: Env, reporter: Address, allowed: bool) {
        admin_check(&env);
        let mut reporters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&REPORTERS)
            .unwrap_or_else(|| Vec::new(&env));
        if allowed && !reporters.contains(&reporter) {
            reporters.push_back(reporter.clone());
        }
        if !allowed {
            let mut filtered: Vec<Address> = Vec::new(&env);
            for r in reporters.iter() {
                if r.clone() != reporter {
                    filtered.push_back(r.clone());
                }
            }
            reporters = filtered;
        }
        env.storage().persistent().set(&REPORTERS, &reporters);
    }

    /// Emergency pause of price reporting reads. Admin only.
    pub fn set_paused(env: Env, paused: bool) {
        admin_check(&env);
        env.storage().instance().set(&PAUSED, &paused);
    }

    // ---------- reporters ----------

    /// Push a fresh variable-rate observation for a pool. Callable by a
    /// registered reporter (e.g. StrategyAdapter) or the admin.
    pub fn report_variable_rate(
        env: Env,
        reporter: Address,
        pool_id: Address,
        rate: i128,
        round: u64,
    ) {
        let reporters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&REPORTERS)
            .unwrap_or_else(|| Vec::new(&env));
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if reporter != admin && !reporters.contains(&reporter) {
            panic!("oracle-hub: unauthorized reporter");
        }
        reporter.require_auth();
        if !(0..=common::MAX_RATE).contains(&rate) {
            panic!("oracle-hub: rate out of bounds");
        }
        let ts = env.ledger().timestamp();
        let mut rates: Map<Address, VarRate> = env
            .storage()
            .persistent()
            .get(&VAR_RATES)
            .unwrap_or_else(|| Map::new(&env));
        rates.set(pool_id.clone(), VarRate { rate, ts, round });
        env.storage().persistent().set(&VAR_RATES, &rates);
        VarRateEvent {
            pool_id: pool_id.clone(),
            rate,
            ts,
            round,
        }
        .publish(&env);
    }

    // ---------- reads ----------

    /// Read the current variable rate (per annum, RATE_SCALE-scaled) for a pool.
    pub fn get_variable_rate(env: Env, pool_id: Address) -> (i128, u64) {
        let rates: Map<Address, VarRate> = env
            .storage()
            .persistent()
            .get(&VAR_RATES)
            .unwrap_or_else(|| Map::new(&env));
        let obs = rates.get(pool_id).expect("oracle-hub: no variable rate");
        (obs.rate, obs.round)
    }

    /// Fetch a live SEP-40 price for an asset. Enforces staleness and sanity.
    pub fn get_price(env: Env, asset: Address) -> (i128, u64) {
        if env.storage().instance().get(&PAUSED).unwrap_or(false) {
            panic!("oracle-hub: paused");
        }
        let feeds: Map<Address, Feed> = env
            .storage()
            .persistent()
            .get(&FEEDS)
            .unwrap_or_else(|| Map::new(&env));
        let feed = feeds.get(asset.clone()).expect("oracle-hub: no feed");
        let (price, ts, valid): (i128, u64, bool) = env.invoke_contract(
            &feed.oracle,
            &symbol_short!("lastprice"),
            (asset.clone(),).into_val(&env),
        );
        if !valid {
            panic!("oracle-hub: oracle marked invalid");
        }
        let now = env.ledger().timestamp();
        if now < ts || now - ts > feed.max_staleness {
            panic!("oracle-hub: stale price");
        }
        // Sanity: price must be positive and within a sane band.
        if price <= 0 {
            panic!("oracle-hub: non-positive price");
        }
        let scale = pow10(feed.decimals);
        let normalized = checked_mul_div(&env, price, RATE_SCALE, scale);
        if normalized <= 0 || normalized > 1_000_000 * RATE_SCALE {
            panic!("oracle-hub: price sanity check failed");
        }
        OracleSync {
            asset: asset.clone(),
            price,
            ts,
            valid,
        }
        .publish(&env);
        (normalized, ts)
    }

    /// Returns the registered SEP-40 feed for an asset.
    pub fn get_feed(env: Env, asset: Address) -> Option<Feed> {
        let feeds: Map<Address, Feed> = env
            .storage()
            .persistent()
            .get(&FEEDS)
            .unwrap_or_else(|| Map::new(&env));
        feeds.get(asset)
    }
}

fn pow10(n: u32) -> i128 {
    let mut out: i128 = 1;
    for _ in 0..n {
        out *= 10;
    }
    out
}

fn admin_check(env: &Env) {
    let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    admin.require_auth();
}

#[cfg(test)]
mod test;
