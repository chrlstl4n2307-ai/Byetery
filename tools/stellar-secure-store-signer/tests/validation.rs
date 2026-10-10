use byetery_secure_store_signer::*;
use soroban_cli::xdr::*;
const NOW: u64 = 1700000000;
fn sym(s: &str) -> ScSymbol {
    ScSymbol(s.as_bytes().to_vec().try_into().unwrap())
}
fn string(s: &str) -> ScVal {
    ScVal::String(ScString(s.as_bytes().to_vec().try_into().unwrap()))
}
fn bytes() -> ScVal {
    ScVal::Bytes(ScBytes(vec![1; 32].try_into().unwrap()))
}
fn addr(s: &str) -> ScAddress {
    let p = stellar_strkey::ed25519::PublicKey::from_string(s).unwrap();
    ScAddress::Account(AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(p.0))))
}
fn ev(kind: &str) -> ScVal {
    let pairs = vec![
        ("battery_id", string("BYE-OFFLINE-TEST")),
        (
            "kind",
            ScVal::Vec(Some(ScVec(
                vec![ScVal::Symbol(sym(kind))].try_into().unwrap(),
            ))),
        ),
        ("payload_hash", bytes()),
        ("request_id", bytes()),
        ("version", ScVal::U32(1)),
    ];
    ScVal::Map(Some(ScMap(
        pairs
            .into_iter()
            .map(|(k, val)| ScMapEntry {
                key: ScVal::Symbol(sym(k)),
                val,
            })
            .collect::<Vec<_>>()
            .try_into()
            .unwrap(),
    )))
}
fn tx(method: &str) -> Transaction {
    let (source, args) = match method {
        "register_battery" => (ADMIN, vec![string("BYE-OFFLINE-TEST"), bytes()]),
        "open_return" => (
            SERVICE,
            vec![
                string("BYE-OFFLINE-TEST"),
                bytes(),
                ScVal::Address(addr(ADMIN)),
            ],
        ),
        "cancel_return" => (SERVICE, vec![string("BYE-OFFLINE-TEST"), bytes()]),
        "confirm_collection" => (
            SERVICE,
            vec![
                string("BYE-OFFLINE-TEST"),
                bytes(),
                ScVal::Address(addr(COLLECTOR)),
                ev("Collection"),
            ],
        ),
        "confirm_recycling" => (
            RECYCLER,
            vec![
                string("BYE-OFFLINE-TEST"),
                bytes(),
                ScVal::Address(addr(RECYCLER)),
                ev("Recycling"),
            ],
        ),
        _ => (SERVICE, vec![string("BYE-OFFLINE-TEST")]),
    };
    let call = InvokeContractArgs {
        contract_address: ScAddress::Contract(ContractId(Hash(
            stellar_strkey::Contract::from_string(CONTRACT).unwrap().0,
        ))),
        function_name: sym(method),
        args: args.try_into().unwrap(),
    };
    let root = SorobanAuthorizedInvocation {
        function: SorobanAuthorizedFunction::ContractFn(call.clone()),
        sub_invocations: VecM::default(),
    };
    let mut auth = vec![SorobanAuthorizationEntry {
        credentials: SorobanCredentials::SourceAccount,
        root_invocation: root.clone(),
    }];
    if method == "confirm_collection" {
        auth.push(SorobanAuthorizationEntry {
            credentials: SorobanCredentials::Address(SorobanAddressCredentials {
                address: addr(COLLECTOR),
                nonce: 1,
                signature_expiration_ledger: 0,
                signature: ScVal::Void,
            }),
            root_invocation: root,
        });
    }
    Transaction {
        source_account: MuxedAccount::Ed25519(Uint256(
            stellar_strkey::ed25519::PublicKey::from_string(source)
                .unwrap()
                .0,
        )),
        fee: 10000,
        seq_num: SequenceNumber(1),
        cond: Preconditions::Time(TimeBounds {
            min_time: TimePoint(0),
            max_time: TimePoint(NOW + 120),
        }),
        memo: Memo::None,
        operations: vec![Operation {
            source_account: None,
            body: OperationBody::InvokeHostFunction(InvokeHostFunctionOp {
                host_function: HostFunction::InvokeContract(call),
                auth: auth.try_into().unwrap(),
            }),
        }]
        .try_into()
        .unwrap(),
        ext: TransactionExt::V1(SorobanTransactionData::default()),
    }
}
fn request(t: Transaction) -> Request {
    Request {
        version: 1,
        network_passphrase: NETWORK.into(),
        current_ledger: 1,
        signature_expiration_ledger: 100,
        transaction_xdr: TransactionEnvelope::Tx(TransactionV1Envelope {
            tx: t,
            signatures: VecM::default(),
        })
        .to_xdr_base64(Limits::none())
        .unwrap(),
    }
}
fn body(t: &mut Transaction) -> &mut InvokeHostFunctionOp {
    let OperationBody::InvokeHostFunction(b) = &mut t.operations[0].body else {
        panic!()
    };
    b
}
#[test]
fn all_six_methods_validate_and_map_fixed_signers() {
    for method in [
        "register_battery",
        "open_return",
        "cancel_return",
        "confirm_collection",
        "confirm_recycling",
        "pay_reward",
    ] {
        let v = validate(&request(tx(method)), NOW).unwrap();
        assert_eq!(v.method, method);
        assert_eq!(
            v.signers.len(),
            if method == "confirm_collection" { 2 } else { 1 }
        );
    }
}
#[test]
fn collection_has_source_service_and_address_collector() {
    let v = validate(&request(tx("confirm_collection")), NOW).unwrap();
    assert_eq!(v.source, SERVICE);
    assert_eq!(v.signers, vec![SERVICE, COLLECTOR]);
}
#[test]
fn malformed_xdr_rejected() {
    let mut r = request(tx("pay_reward"));
    r.transaction_xdr = "invalid".into();
    assert_eq!(validate(&r, NOW).err(), Some("InvalidXdr"));
}
#[test]
fn wrong_network_rejected() {
    let mut r = request(tx("pay_reward"));
    r.network_passphrase = "Public Global Stellar Network ; September 2015".into();
    assert_eq!(validate(&r, NOW).err(), Some("WrongNetwork"));
}
#[test]
fn wrong_contract_rejected() {
    let mut t = tx("pay_reward");
    let HostFunction::InvokeContract(c) = &mut body(&mut t).host_function else {
        panic!()
    };
    c.contract_address = ScAddress::Contract(ContractId(Hash([0; 32])));
    assert_eq!(validate(&request(t), NOW).err(), Some("WrongContract"));
}
#[test]
fn unapproved_method_rejected() {
    assert_eq!(
        validate(&request(tx("set_role")), NOW).err(),
        Some("MethodNotAllowed")
    );
}
#[test]
fn wrong_source_rejected() {
    let mut t = tx("pay_reward");
    t.source_account = MuxedAccount::Ed25519(Uint256([0; 32]));
    assert_eq!(validate(&request(t), NOW).err(), Some("WrongSource"));
}
#[test]
fn wrong_collector_rejected() {
    let mut t = tx("confirm_collection");
    let HostFunction::InvokeContract(c) = &mut body(&mut t).host_function else {
        panic!()
    };
    c.args[2] = ScVal::Address(addr(ADMIN));
    assert_eq!(validate(&request(t), NOW).err(), Some("WrongActor"));
}
#[test]
fn missing_collector_auth_rejected() {
    let mut t = tx("confirm_collection");
    body(&mut t).auth = vec![body(&mut t).auth[0].clone()].try_into().unwrap();
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("WrongAuthorizationCount")
    );
}
#[test]
fn missing_service_auth_rejected() {
    let mut t = tx("confirm_collection");
    body(&mut t).auth = vec![body(&mut t).auth[1].clone()].try_into().unwrap();
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("WrongAuthorizationCount")
    );
}
#[test]
fn wrong_auth_signer_rejected() {
    let mut t = tx("confirm_collection");
    let SorobanCredentials::Address(c) = &mut body(&mut t).auth[1].credentials else {
        panic!()
    };
    c.address = addr(ADMIN);
    assert_eq!(validate(&request(t), NOW).err(), Some("WrongAuthSigner"));
}
#[test]
fn auth_with_different_arguments_rejected() {
    let mut t = tx("pay_reward");
    let SorobanAuthorizedFunction::ContractFn(c) =
        &mut body(&mut t).auth[0].root_invocation.function
    else {
        panic!()
    };
    c.args[0] = string("BYE-OTHER");
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("AuthInvocationMismatch")
    );
}
#[test]
fn nested_authorization_rejected() {
    let mut t = tx("pay_reward");
    let root = body(&mut t).auth[0].root_invocation.clone();
    body(&mut t).auth[0].root_invocation.sub_invocations = vec![root].try_into().unwrap();
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("AuthInvocationMismatch")
    );
}
#[test]
fn unlimited_time_rejected() {
    let mut t = tx("pay_reward");
    t.cond = Preconditions::None;
    assert_eq!(validate(&request(t), NOW).err(), Some("TimeBoundsRequired"));
}
#[test]
fn excessive_fee_rejected() {
    let mut t = tx("pay_reward");
    t.fee = 50000001;
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("InvalidSequenceOrFee")
    );
}
#[test]
fn two_operations_rejected() {
    let mut t = tx("pay_reward");
    t.operations = vec![t.operations[0].clone(), t.operations[0].clone()]
        .try_into()
        .unwrap();
    assert_eq!(
        validate(&request(t), NOW).err(),
        Some("OperationCountNotAllowed")
    );
}
#[test]
fn excessive_expiration_rejected() {
    let mut r = request(tx("pay_reward"));
    r.signature_expiration_ledger = 122;
    assert_eq!(validate(&r, NOW).err(), Some("InvalidExpirationLedger"));
}
#[test]
fn input_cannot_select_identity_or_supply_keys() {
    let v = serde_json::json!({"version":1,"network_passphrase":NETWORK,"transaction_xdr":"invalid","current_ledger":1,"signature_expiration_ledger":100,"identity":"arbitrary"});
    assert!(serde_json::from_value::<Request>(v).is_err());
}
