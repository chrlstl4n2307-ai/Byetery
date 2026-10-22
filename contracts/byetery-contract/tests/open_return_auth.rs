// BYE-W1-007: additional isolated test, preserving frozen src/test.rs and its hash guard.
use byetery_contract::events::ReturnOpened;
use byetery_contract::{
    BatteryState, ByeteryClient, RequestState, ReturnRequest, RewardState, TESTNET_PASSPHRASE,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token, Address, Bytes, BytesN, Env, IntoVal, String, Val, Vec,
};

fn authorize(e: &Env, id: &Address, name: &str, args: Vec<Val>, actor: &Address) {
    e.mock_auths(&[MockAuth {
        address: actor,
        invoke: &MockAuthInvoke {
            contract: id,
            fn_name: name,
            args,
            sub_invokes: &[],
        },
    }]);
}

#[test]
fn open_return_rejects_wrong_actor_and_accepts_service_with_identical_arguments() {
    use soroban_sdk::{
        testutils::{AuthorizedFunction, AuthorizedInvocation, Events},
        xdr::{ScErrorCode, ScErrorType},
        Event, Symbol,
    };

    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    let network: BytesN<32> = e
        .crypto()
        .sha256(&Bytes::from_slice(&e, TESTNET_PASSPHRASE))
        .into();
    e.ledger().with_mut(|l| l.network_id = network.to_array());
    let admin = Address::generate(&e);
    let configured_service = Address::generate(&e);
    let recipient = Address::generate(&e);
    let token_id = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    #[cfg(not(feature = "wasm-tests"))]
    let id = e.register(
        byetery_contract::Byetery,
        (&admin, &configured_service, &token_id, &100_000_000i128),
    );
    // Fixture deployment only; the original WASM test separately checks constructor auth.
    #[cfg(feature = "wasm-tests")]
    e.mock_all_auths_allowing_non_root_auth();
    #[cfg(feature = "wasm-tests")]
    let id = e.register(
        &include_bytes!("../target/wasm32v1-none/release/byetery_contract.wasm")[..],
        (&admin, &configured_service, &token_id, &100_000_000i128),
    );
    e.set_auths(&[]);
    let client = ByeteryClient::new(&e, &id);
    let battery_id = String::from_str(&e, "BYE-W1-007-AUTH");
    let request_id = BytesN::from_array(&e, &[7; 32]);
    let registration_hash = BytesN::from_array(&e, &[3; 32]);
    authorize(
        &e,
        &id,
        "register_battery",
        (&battery_id, &registration_hash).into_val(&e),
        &admin,
    );
    client.register_battery(&battery_id, &registration_hash);
    let service = client.get_config().service;
    let wrong_actor = Address::generate(&e);
    assert_eq!(service, configured_service);
    assert_ne!(wrong_actor, service);

    assert_ne!(recipient, id);
    let before = client.get_battery(&battery_id).unwrap();
    assert_eq!(before.state, BatteryState::Registered);
    assert_eq!(before.request_id, None);
    assert_eq!(before.reward_state, RewardState::NotEligible);
    assert_eq!(client.get_request(&request_id), None);
    let token = token::Client::new(&e, &token_id);
    let contract_balance = token.balance(&id);
    let recipient_balance = token.balance(&recipient);
    let args: soroban_sdk::Vec<soroban_sdk::Val> =
        (&battery_id, &request_id, &recipient).into_val(&e);

    // Correct invocation, ONLY the wrong actor authorized. No blanket auth.
    authorize(&e, &id, "open_return", args.clone(), &wrong_actor);
    let rejected = client.try_open_return(&battery_id, &request_id, &recipient);
    // The host narrows Auth/InvalidAction to Context/InvalidAction at try_call.
    // This is a host authorization failure, NOT contract RoleNotGranted.
    assert_eq!(
        rejected,
        Err(Ok(soroban_sdk::Error::from_type_and_code(
            ScErrorType::Context,
            ScErrorCode::InvalidAction,
        )))
    );
    assert_eq!(e.events().all().filter_by_contract(&id), []);
    let after = client.get_battery(&battery_id).unwrap();
    assert_eq!(after, before);
    assert_eq!(after.state, BatteryState::Registered);
    assert_eq!(after.request_id, None);
    assert_eq!(after.reward_state, RewardState::NotEligible);
    assert_eq!(client.get_request(&request_id), None);
    assert_eq!(token.balance(&id), contract_balance);
    assert_eq!(token.balance(&recipient), recipient_balance);

    // Exact same arguments and fixture: only the authorized identity changes.
    authorize(&e, &id, "open_return", args.clone(), &service);
    assert_eq!(
        client.try_open_return(&battery_id, &request_id, &recipient),
        Ok(Ok(request_id.clone()))
    );
    assert_eq!(
        e.auths(),
        std::vec![(
            service.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    id.clone(),
                    Symbol::new(&e, "open_return"),
                    args,
                )),
                sub_invocations: std::vec![],
            },
        )]
    );
    assert_eq!(
        e.events().all().filter_by_contract(&id),
        [ReturnOpened {
            battery_id: battery_id.clone(),
            request_id: request_id.clone(),
        }
        .to_xdr(&e, &id)]
    );
    let returned = client.get_battery(&battery_id).unwrap();
    assert_eq!(returned.state, BatteryState::Returned);
    assert_eq!(returned.request_id, Some(request_id.clone()));
    assert_eq!(returned.reward_state, RewardState::NotEligible);
    assert_eq!(
        client.get_request(&request_id),
        Some(ReturnRequest {
            battery_id: battery_id.clone(),
            recipient: recipient.clone(),
            state: RequestState::Open,
        })
    );
    assert_eq!(token.balance(&id), contract_balance);
    assert_eq!(token.balance(&recipient), recipient_balance);
    std::println!(
        "BYE-W1-007 service={service:?} wrong_actor={wrong_actor:?} battery={battery_id:?} request={request_id:?} recipient={recipient:?} rejected={rejected:?}; wrong_actor: REGISTERED/NOT_ELIGIBLE/request=None/events=0/balances=UNCHANGED; service: RETURNED/OPEN/NOT_ELIGIBLE/events=1/balances=UNCHANGED"
    );
}
