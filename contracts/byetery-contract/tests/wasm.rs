#![cfg(feature = "wasm-tests")]

use byetery_contract::{ByeteryClient, TESTNET_PASSPHRASE};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    Address, Bytes, BytesN, Env, IntoVal,
};

// Built separately first, so these tests exercise the actual release artifact.
const WASM: &[u8] = include_bytes!("../target/wasm32v1-none/release/byetery_contract.wasm");

#[contract]
struct Factory;

#[contractimpl]
impl Factory {
    pub fn deploy(
        e: Env,
        wasm: BytesN<32>,
        salt: BytesN<32>,
        admin: Address,
        service: Address,
        token: Address,
        amount: i128,
    ) -> Address {
        e.deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, (admin, service, token, amount))
    }
}

#[test]
fn wasm_constructor_requires_admin_not_deployment_source() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    let network: BytesN<32> = e
        .crypto()
        .sha256(&Bytes::from_slice(&e, TESTNET_PASSPHRASE))
        .into();
    e.ledger().with_mut(|l| l.network_id = network.to_array());
    let factory = e.register(Factory, ());
    let admin = Address::generate(&e);
    let service = Address::generate(&e);
    let token = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    let hash = e
        .deployer()
        .upload_contract_wasm(Bytes::from_slice(&e, WASM));
    let salt = BytesN::from_array(&e, &[41; 32]);
    let id = e
        .deployer()
        .with_address(factory.clone(), salt.clone())
        .deployed_address();
    let client = FactoryClient::new(&e, &factory);
    // The factory authorizes its own deployment but is not the administrator.
    e.set_auths(&[]);
    assert!(client
        .try_deploy(&hash, &salt, &admin, &service, &token, &100_000_000)
        .is_err());
    assert_ne!(factory, admin);
    e.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "__constructor",
            args: (&admin, &service, &token, 100_000_000i128).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(
        client.deploy(&hash, &salt, &admin, &service, &token, &100_000_000),
        id
    );
    assert_eq!(ByeteryClient::new(&e, &id).get_config().admin, admin);
}
