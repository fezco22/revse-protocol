#![cfg(test)]
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, Event};

use crate::*;

const TERM: u64 = 30 * common::DAY_SECONDS;

/// A fully-wired protocol instance: USDC, fUSDC, OracleHub, RateVAMM,
/// MockPool, StrategyAdapter and PositionSettlement all registered together.
struct Chain<'a> {
    env: &'a Env,
    admin: Address,
    tc: StellarAssetClient<'a>,
    fusdc: fusdc::FusdcClient<'a>,
    oracle: oracle_hub::OracleHubClient<'a>,
    vamm: rate_vamm::RateVammClient<'a>,
    pool: mock_pool::MockPoolClient<'a>,
    strategy: strategy_adapter::StrategyAdapterClient<'a>,
    ps: PositionSettlementClient<'a>,
    ps_id: Address,
}

impl<'a> Chain<'a> {
    fn user(&self) -> Address {
        Address::generate(self.env)
    }

    fn mint(&self, to: &Address, amount: &i128) {
        self.tc.mint(to, amount);
    }

    fn approve(&self, from: &Address, spender: &Address, amount: &i128) {
        self.tc.approve(from, spender, amount, &5_000_000u32);
    }

    fn balance(&self, addr: &Address) -> i128 {
        self.tc.balance(addr)
    }

    fn jump_past_maturity(&self, id: &u64) {
        let pos = self.ps.get_position(id).unwrap();
        self.env.ledger().set_timestamp(pos.maturity_ts + 1);
    }

    fn withdraw_strategy_idle(&self, amount: &i128) {
        self.ps.withdraw_from_strategy(amount);
    }
}

/// Deploy the full stack. PositionSettlement is registered first so its id can
/// be wired as fUSDC minter, VAMM settlement and strategy admin.
fn deploy_chain(env: &Env) -> Chain<'_> {
    // Multi-contract chain: PS -> VAMM/SAC/fUSDC and PS -> strategy -> pool.
    // Nested contracts call require_auth() for their own sub-invocations, so we
    // allow non-root authorizations (the atomicity isn't what's under test).
    env.mock_all_auths_allowing_non_root_auth();
    let admin = Address::generate(env);

    // PositionSettlement id first.
    let ps_id = env.register(PositionSettlement, ());

    // USDC (SEP-41 SAC). Admin is the token issuer for test minting.
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let tc = StellarAssetClient::new(env, &token);

    // OracleHub.
    let oracle_id = env.register(oracle_hub::OracleHub, ());
    let oracle = oracle_hub::OracleHubClient::new(env, &oracle_id);
    oracle.init(&admin, &(60 * 60));

    // RateVAMM.
    let vamm_id = env.register(rate_vamm::RateVamm, ());
    let vamm = rate_vamm::RateVammClient::new(env, &vamm_id);
    vamm.init(
        &admin,
        &oracle_id,
        &rate_vamm::VammConfig {
            term_seconds: TERM,
            idle_rate: common::RATE_SCALE / 20,
            slope: common::RATE_SCALE / 2,
            min_rate: common::RATE_SCALE / 100,
            max_rate: common::RATE_SCALE / 4,
        },
    );
    vamm.set_settlement(&ps_id);

    // MockPool + StrategyAdapter (pool admin == strategy, strategy admin == PS).
    let pool_id = env.register(mock_pool::MockPool, ());
    let pool = mock_pool::MockPoolClient::new(env, &pool_id);
    let strategy_id = env.register(strategy_adapter::StrategyAdapter, ());
    let strategy = strategy_adapter::StrategyAdapterClient::new(env, &strategy_id);
    pool.init(
        &strategy_id,
        &token,
        &(common::RATE_SCALE / 50),
        &(common::RATE_SCALE / 2),
    );
    strategy.init(&ps_id, &token, &pool_id, &oracle_id);

    // fUSDC, mintable only by PositionSettlement.
    let fusdc_id = env.register(fusdc::Fusdc, ());
    let fusdc = fusdc::FusdcClient::new(env, &fusdc_id);
    fusdc.init(&admin, &ps_id, &7);

    // Oracle reporters: the strategy / settlement can push variable rates.
    oracle.set_reporter(&strategy_id, &true);
    oracle.set_reporter(&ps_id, &true);

    let ps = PositionSettlementClient::new(env, &ps_id);
    ps.init(
        &admin,
        &vamm_id,
        &oracle_id,
        &token,
        &fusdc_id,
        &strategy_id,
        &1_500_000_000, // min collateral 150%
        &1_100_000_000, // liq threshold 110%
        &100,           // protocol fee 1%
    );

    Chain {
        env,
        admin,
        tc,
        fusdc,
        oracle,
        vamm,
        pool,
        strategy,
        ps,
        ps_id,
    }
}

// ---------------------------------------------------------------------------
// Fixed-rate deposit & maturity claim
// ---------------------------------------------------------------------------

#[test]
fn deposit_fixed_mints_receipt_and_records_position() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 100_000_000i128;

    chain.mint(&user, &amount);
    chain.approve(&user, &chain.ps_id, &amount);

    let id = chain.ps.deposit_fixed(&user, &amount);
    let pos = chain.ps.get_position(&id).unwrap();
    assert_eq!(pos.side, Side::Deposit);
    assert_eq!(pos.amount, amount);
    assert_eq!(pos.user, user);
    assert!(!pos.claimed);
    assert_eq!(pos.maturity_ts - pos.open_ts, TERM);
    assert!(pos.apy >= common::RATE_SCALE / 100);
    assert!(pos.apy <= common::RATE_SCALE / 4);

    // fUSDC minted 1:1; USDC pulled into the vault.
    assert_eq!(chain.fusdc.balance(&user), amount);
    assert_eq!(chain.fusdc.total_supply(), amount);
    assert_eq!(chain.balance(&user), 0);
    assert_eq!(chain.balance(&chain.ps_id), amount);
}

#[test]
fn deposit_fixed_requires_usdc_allowance() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 100_000_000i128;

    chain.mint(&user, &amount);
    // No allowance granted -> the SAC transfer_from must fail.
    assert!(chain.ps.try_deposit_fixed(&user, &amount).is_err());
}

#[test]
fn claim_maturity_pays_principal_plus_interest() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 100_000_000i128;

    chain.mint(&user, &amount);
    chain.approve(&user, &chain.ps_id, &amount);
    let id = chain.ps.deposit_fixed(&user, &amount);

    // Extra vault reserves fund the interest leg.
    chain.mint(&chain.ps_id, &10_000_000_000);

    chain.jump_past_maturity(&id);
    let payout = chain.ps.claim_maturity(&id);

    let pos = chain.ps.get_position(&id).unwrap();
    let expected = amount + common::term_interest(&env, amount, pos.apy, TERM);
    assert_eq!(payout, expected);
    assert_eq!(chain.fusdc.balance(&user), 0);
    assert_eq!(chain.fusdc.total_supply(), 0);
    assert_eq!(chain.balance(&user), payout);
    assert!(chain.ps.get_position(&id).unwrap().claimed);
}

#[test]
fn claim_before_maturity_is_rejected() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 100_000_000i128;

    chain.mint(&user, &amount);
    chain.approve(&user, &chain.ps_id, &amount);
    let id = chain.ps.deposit_fixed(&user, &amount);

    assert!(chain.ps.try_claim_maturity(&id).is_err());
}

// ---------------------------------------------------------------------------
// Fixed-rate borrow & repay
// ---------------------------------------------------------------------------

#[test]
fn borrow_fixed_rejects_undercollateralized_loan() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let borrow = 100_000_000i128;
    // 100% collateral (below the 150% minimum).
    let collateral = borrow;

    assert!(chain
        .ps
        .try_borrow_fixed(&user, &collateral, &borrow)
        .is_err());
}

#[test]
fn borrow_fixed_disburses_and_records_position() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    // Vault must hold funds to lend out.
    chain.mint(&chain.ps_id, &1_000_000_000_000);

    let borrow = 100_000_000i128;
    let collateral = 200_000_000i128; // 200% -> above minimum
    chain.mint(&user, &collateral);
    chain.approve(&user, &chain.ps_id, &collateral);

    let id = chain.ps.borrow_fixed(&user, &collateral, &borrow);
    let pos = chain.ps.get_position(&id).unwrap();
    assert_eq!(pos.side, Side::Borrow);
    assert_eq!(pos.amount, borrow);
    assert_eq!(pos.collateral, collateral);
    assert_eq!(chain.balance(&user), borrow);
    // Vault: seeded 1e12 - lent borrow + seized collateral.
    assert_eq!(
        chain.balance(&chain.ps_id),
        1_000_000_000_000 - borrow + collateral
    );
}

#[test]
fn repay_returns_collateral_and_closes_loan() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    chain.mint(&chain.ps_id, &1_000_000_000_000);

    let borrow = 100_000_000i128;
    let collateral = 200_000_000i128;
    chain.mint(&user, &collateral);
    chain.approve(&user, &chain.ps_id, &collateral);
    let id = chain.ps.borrow_fixed(&user, &collateral, &borrow);

    let pos = chain.ps.get_position(&id).unwrap();
    let owed = borrow + common::term_interest(&env, borrow, pos.apy, TERM);
    // User holds the borrowed principal plus own funds to cover interest.
    chain.mint(&user, &owed);
    chain.approve(&user, &chain.ps_id, &owed);

    let repaid = chain.ps.repay(&id);
    assert_eq!(repaid, owed);
    assert_eq!(chain.balance(&user), collateral + borrow); // borrow + returned collateral
    assert!(chain.ps.get_position(&id).unwrap().claimed);
}

// ---------------------------------------------------------------------------
// Liquidation
// ---------------------------------------------------------------------------

#[test]
fn liquidate_underwater_borrow_at_maturity() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let keeper = chain.user();
    chain.mint(&chain.ps_id, &1_000_000_000_000);

    let borrow = 100_000_000i128;
    let collateral = 200_000_000i128;
    chain.mint(&user, &collateral);
    chain.approve(&user, &chain.ps_id, &collateral);
    let id = chain.ps.borrow_fixed(&user, &collateral, &borrow);

    assert!(chain.ps.try_liquidate(&id).is_err(), "healthy loan");

    chain.jump_past_maturity(&id);
    let bonus = chain.ps.liquidate(&id);
    let fee = common::checked_mul_div(&env, collateral, 100, 10_000); // 1% protocol fee
    assert_eq!(bonus, collateral - fee);
    assert!(chain.ps.get_position(&id).unwrap().liquidated);
    assert_eq!(chain.balance(&keeper), 0); // contract pays to itself in the mock
}

// ---------------------------------------------------------------------------
// Strategy pipeline (inter-contract chain)
// ---------------------------------------------------------------------------

#[test]
fn allocate_pipeline_deploys_vault_idle_to_strategy() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 500_000_000i128;

    chain.mint(&user, &amount);
    chain.approve(&user, &chain.ps_id, &amount);
    let _id = chain.ps.deposit_fixed(&user, &amount);

    // Allowances: PS (vault wallet) -> strategy, strategy -> pool.
    chain.approve(&chain.ps_id, &chain.strategy.address.clone(), &amount);
    chain.approve(
        &chain.strategy.address.clone(),
        &chain.pool.address.clone(),
        &amount,
    );

    let got = chain.ps.allocate(&amount);
    assert_eq!(got, amount);
    assert_eq!(chain.pool.total_assets(), amount);
    assert_eq!(chain.strategy.state().shares, amount);
    assert_eq!(chain.strategy.total_vaulted(), amount);
    assert_eq!(chain.balance(&chain.ps_id), 0);

    // Withdraw the idle funds back to the vault.
    chain.withdraw_strategy_idle(&amount);
    assert_eq!(chain.balance(&chain.ps_id), amount);
    assert_eq!(chain.pool.total_assets(), 0);
}

#[test]
fn sync_rate_reports_pool_rate_and_vamm_mark_to_market() {
    let env = Env::default();
    let chain = deploy_chain(&env);

    // Report the mock-pool's rate to the oracle for the pool id.
    let r = chain.strategy.sync_rate();
    assert_eq!(r, chain.pool.rate());
    assert_eq!(
        chain
            .oracle
            .get_variable_rate(&chain.pool.address.clone())
            .0,
        r
    );

    // The VAMM reads its own pool id; seed that rate from admin and mark.
    let vamm_rate = common::RATE_SCALE / 10;
    chain
        .oracle
        .report_variable_rate(&chain.admin, &chain.vamm.address.clone(), &vamm_rate, &1);
    let base = chain.vamm.mark_to_market();
    assert_eq!(base, vamm_rate);
    // With zero utilization the quoted apy stays at the configured idle rate.
    assert_eq!(chain.vamm.state().apy, common::RATE_SCALE / 20);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[test]
fn deposit_emits_events() {
    let env = Env::default();
    let chain = deploy_chain(&env);
    let user = chain.user();
    let amount = 100_000_000i128;

    chain.mint(&user, &amount);
    chain.approve(&user, &chain.ps_id, &amount);
    let id = chain.ps.deposit_fixed(&user, &amount);

    // Snapshot the settlement event log immediately (subsequent calls may
    // replace the host event buffer), then build the expected DepositFx.
    let events = env.events().all().filter_by_contract(&chain.ps_id);
    let pos = chain.ps.get_position(&id).unwrap();
    let expected = crate::DepositFx {
        id,
        user: user.clone(),
        amount,
        apy: pos.apy,
        maturity_ts: pos.maturity_ts,
        interest: common::term_interest(&env, amount, pos.apy, TERM),
    }
    .to_xdr(&env, &chain.ps_id);

    assert!(
        events.events().contains(&expected),
        "expected a depositfx event; got {:?}",
        events.events()
    );
}
