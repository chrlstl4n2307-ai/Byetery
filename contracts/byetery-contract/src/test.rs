extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    IntoVal,
};

struct Fixture {
    e: Env,
    id: Address,
    admin: Address,
    service: Address,
    collector: Address,
    recycler: Address,
    recipient: Address,
    token: Address,
    issuer: Address,
}

impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.cost_estimate().budget().reset_unlimited();
        let network: BytesN<32> = e
            .crypto()
            .sha256(&Bytes::from_slice(&e, TESTNET_PASSPHRASE))
            .into();
        e.ledger().with_mut(|l| l.network_id = network.to_array());
        let admin = Address::generate(&e);
        let service = Address::generate(&e);
        let collector = Address::generate(&e);
        let recycler = Address::generate(&e);
        let recipient = Address::generate(&e);
        let issuer = Address::generate(&e);
        let bootstrap = e.register_stellar_asset_contract_v2(issuer.clone());
        bootstrap
            .issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
        let soroban_sdk::xdr::Asset::CreditAlphanum4(source) = bootstrap.asset() else {
            unreachable!()
        };
        let asset = soroban_sdk::xdr::Asset::CreditAlphanum12(soroban_sdk::xdr::AlphaNum12 {
            // Stellar classic asset codes are alphanumeric. GREEN-TEST is the UI label.
            asset_code: soroban_sdk::xdr::AssetCode12(*b"GREENTEST\0\0\0"),
            issuer: source.issuer,
        });
        let encoded =
            soroban_sdk::xdr::WriteXdr::to_xdr(&asset, soroban_sdk::xdr::Limits::none()).unwrap();
        let token = e
            .deployer()
            .with_stellar_asset(Bytes::from_slice(&e, &encoded))
            .deploy();
        // Only issuer bootstrap uses blanket auth; no Byetery call runs with it.
        // SDK MockAuth installs contract authenticators and cannot model this G-account.
        e.mock_all_auths();
        token::StellarAssetClient::new(&e, &token).set_admin(&issuer);
        e.set_auths(&[]);
        #[cfg(not(feature = "wasm-tests"))]
        let id = e.register(Byetery, (&admin, &service, &token, &100_000_000i128));
        // Registration is fixture setup, not an authorization test. Real constructor
        // enforcement is covered separately through deploy_v2 in tests/wasm.rs.
        #[cfg(feature = "wasm-tests")]
        e.mock_all_auths_allowing_non_root_auth();
        #[cfg(feature = "wasm-tests")]
        let id = e.register(
            &include_bytes!("../target/wasm32v1-none/release/byetery_contract.wasm")[..],
            (&admin, &service, &token, &100_000_000i128),
        );
        e.set_auths(&[]);
        Self {
            e,
            id,
            admin,
            service,
            collector,
            recycler,
            recipient,
            token,
            issuer,
        }
    }
    fn client(&self) -> ByeteryClient<'_> {
        ByeteryClient::new(&self.e, &self.id)
    }
    fn bid(&self) -> String {
        String::from_str(&self.e, "BYE-000001")
    }
    fn rid(&self) -> BytesN<32> {
        BytesN::from_array(&self.e, &[7; 32])
    }
    fn hash(&self) -> BytesN<32> {
        BytesN::from_array(&self.e, &[3; 32])
    }
    fn authorize(
        &self,
        name: &'static str,
        args: soroban_sdk::Vec<soroban_sdk::Val>,
        actors: &[&Address],
    ) {
        let invoke = MockAuthInvoke {
            contract: &self.id,
            fn_name: name,
            args,
            sub_invokes: &[],
        };
        let auths: std::vec::Vec<_> = actors
            .iter()
            .map(|a| MockAuth {
                address: a,
                invoke: &invoke,
            })
            .collect();
        self.e.mock_auths(&auths);
    }
    fn register(&self) {
        self.authorize(
            "register_battery",
            (self.bid(), self.hash()).into_val(&self.e),
            &[&self.admin],
        );
        self.client().register_battery(&self.bid(), &self.hash());
    }
    fn grant(&self, actor: &Address, role: ActorRole, enabled: bool) {
        self.authorize(
            "set_role",
            (actor, &role, enabled).into_val(&self.e),
            &[&self.admin],
        );
        self.client().set_role(actor, &role, &enabled);
    }
    fn open(&self) {
        self.authorize(
            "open_return",
            (self.bid(), self.rid(), &self.recipient).into_val(&self.e),
            &[&self.service],
        );
        self.client()
            .open_return(&self.bid(), &self.rid(), &self.recipient);
    }
    fn ev(&self, kind: EvidenceKind) -> Evidence {
        Evidence {
            version: 1,
            battery_id: self.bid(),
            request_id: self.rid(),
            kind,
            payload_hash: self.hash(),
        }
    }
    fn collection_auth(&self, ev: &Evidence, actors: &[&Address]) {
        self.authorize(
            "confirm_collection",
            (self.bid(), self.rid(), &self.collector, ev).into_val(&self.e),
            actors,
        );
    }
    fn collect(&self) {
        self.grant(&self.collector, ActorRole::Collector, true);
        let ev = self.ev(EvidenceKind::Collection);
        self.collection_auth(&ev, &[&self.collector, &self.service]);
        self.client()
            .confirm_collection(&self.bid(), &self.rid(), &self.collector, &ev);
    }
    fn recycle(&self) {
        self.grant(&self.recycler, ActorRole::Recycler, true);
        let ev = self.ev(EvidenceKind::Recycling);
        self.authorize(
            "confirm_recycling",
            (self.bid(), self.rid(), &self.recycler, &ev).into_val(&self.e),
            &[&self.recycler],
        );
        self.client()
            .confirm_recycling(&self.bid(), &self.rid(), &self.recycler, &ev);
    }
    fn fund(&self, amount: i128) {
        let mint = MockAuthInvoke {
            contract: &self.token,
            fn_name: "mint",
            args: (&self.issuer, amount).into_val(&self.e),
            sub_invokes: &[],
        };
        token::StellarAssetClient::new(&self.e, &self.token)
            .mock_auths(&[MockAuth {
                address: &self.issuer,
                invoke: &mint,
            }])
            .mint(&self.issuer, &amount);
        let transfer = MockAuthInvoke {
            contract: &self.token,
            fn_name: "transfer",
            args: (&self.issuer, &self.id, amount).into_val(&self.e),
            sub_invokes: &[],
        };
        token::Client::new(&self.e, &self.token)
            .mock_auths(&[MockAuth {
                address: &self.issuer,
                invoke: &transfer,
            }])
            .transfer(&self.issuer, &self.id, &amount);
    }
    fn pay_auth(&self) {
        self.authorize(
            "pay_reward",
            (self.bid(),).into_val(&self.e),
            &[&self.service],
        );
    }
    fn recipient_authorized(&self, enabled: bool) {
        let call = MockAuthInvoke {
            contract: &self.token,
            fn_name: "set_authorized",
            args: (&self.recipient, enabled).into_val(&self.e),
            sub_invokes: &[],
        };
        token::StellarAssetClient::new(&self.e, &self.token)
            .mock_auths(&[MockAuth {
                address: &self.issuer,
                invoke: &call,
            }])
            .set_authorized(&self.recipient, &enabled);
    }
}

#[test]
fn registration_requires_admin_and_rejects_duplicate_without_mutation() {
    let f = Fixture::new();
    assert!(f
        .client()
        .try_register_battery(&f.bid(), &f.hash())
        .is_err());
    f.register();
    let original = f.client().get_battery(&f.bid()).unwrap();
    assert_eq!(original.state, BatteryState::Registered);
    assert_eq!(original.reward_state, RewardState::NotEligible);
    f.authorize(
        "register_battery",
        (f.bid(), f.hash()).into_val(&f.e),
        &[&f.admin],
    );
    assert_eq!(
        f.client().try_register_battery(&f.bid(), &f.hash()),
        Err(Ok(soroban_sdk::Error::from(Error::BatteryAlreadyExists)))
    );
    assert_eq!(f.client().get_battery(&f.bid()), Some(original));
}

#[test]
fn invalid_identifiers_and_empty_hash_are_rejected() {
    let f = Fixture::new();
    for invalid in [
        "",
        "bye-1",
        "BYE 1",
        "BYE_1",
        "Á",
        "123456789012345678901234567890123",
    ] {
        let id = String::from_str(&f.e, invalid);
        f.authorize(
            "register_battery",
            (&id, f.hash()).into_val(&f.e),
            &[&f.admin],
        );
        assert_eq!(
            f.client().try_register_battery(&id, &f.hash()),
            Err(Ok(soroban_sdk::Error::from(Error::InvalidBatteryId)))
        );
    }
    let zero = BytesN::from_array(&f.e, &[0; 32]);
    f.authorize(
        "register_battery",
        (f.bid(), &zero).into_val(&f.e),
        &[&f.admin],
    );
    assert_eq!(
        f.client().try_register_battery(&f.bid(), &zero),
        Err(Ok(soroban_sdk::Error::from(Error::InvalidEvidence)))
    );
}

#[test]
fn roles_require_admin_and_can_be_revoked() {
    let f = Fixture::new();
    assert!(f
        .client()
        .try_set_role(&f.collector, &ActorRole::Collector, &true)
        .is_err());
    f.grant(&f.collector, ActorRole::Collector, true);
    assert!(f.client().has_role(&f.collector, &ActorRole::Collector));
    f.authorize(
        "set_role",
        (&f.collector, ActorRole::Collector, true).into_val(&f.e),
        &[&f.admin],
    );
    assert!(!f
        .client()
        .set_role(&f.collector, &ActorRole::Collector, &true));
    f.grant(&f.collector, ActorRole::Collector, false);
    assert!(!f.client().has_role(&f.collector, &ActorRole::Collector));
    assert!(!f.client().has_role(&f.admin, &ActorRole::Collector));
}

#[test]
fn collection_requires_both_authorizations_early_spike() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.grant(&f.collector, ActorRole::Collector, true);
    let ev = f.ev(EvidenceKind::Collection);
    for actors in [std::vec![], std::vec![&f.collector], std::vec![&f.service]] {
        f.collection_auth(&ev, &actors);
        assert!(f
            .client()
            .try_confirm_collection(&f.bid(), &f.rid(), &f.collector, &ev)
            .is_err());
        assert_eq!(
            f.client().get_battery(&f.bid()).unwrap().state,
            BatteryState::Returned
        );
        assert_eq!(
            f.client().get_request(&f.rid()).unwrap().state,
            RequestState::Open
        );
    }
    f.collection_auth(&ev, &[&f.collector, &f.service]);
    assert_eq!(
        f.client()
            .confirm_collection(&f.bid(), &f.rid(), &f.collector, &ev),
        BatteryState::Collected
    );
    let authorizers: std::vec::Vec<_> = f.e.auths().into_iter().map(|(a, _)| a).collect();
    assert!(authorizers.contains(&f.collector));
    assert!(authorizers.contains(&f.service));
}

#[test]
fn cancel_keeps_tombstone_and_new_request_needs_new_id() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.authorize(
        "cancel_return",
        (f.bid(), f.rid()).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().cancel_return(&f.bid(), &f.rid()),
        BatteryState::Registered
    );
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().state,
        RequestState::Cancelled
    );
    f.authorize(
        "open_return",
        (f.bid(), f.rid(), &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().try_open_return(&f.bid(), &f.rid(), &f.recipient),
        Err(Ok(soroban_sdk::Error::from(Error::RequestIdAlreadyUsed)))
    );
    let new_id = BytesN::from_array(&f.e, &[8; 32]);
    f.authorize(
        "open_return",
        (f.bid(), &new_id, &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().open_return(&f.bid(), &new_id, &f.recipient),
        new_id
    );
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().state,
        RequestState::Cancelled
    );
}

#[test]
fn no_second_open_request_or_cancellation_after_collection() {
    let f = Fixture::new();
    f.register();
    f.open();
    let other = BytesN::from_array(&f.e, &[9; 32]);
    f.authorize(
        "open_return",
        (f.bid(), &other, &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().try_open_return(&f.bid(), &other, &f.recipient),
        Err(Ok(soroban_sdk::Error::from(Error::InvalidState)))
    );
    assert_eq!(f.client().get_request(&other), None);
    f.collect();
    f.authorize(
        "cancel_return",
        (f.bid(), f.rid()).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().try_cancel_return(&f.bid(), &f.rid()),
        Err(Ok(soroban_sdk::Error::from(Error::RequestNotOpen)))
    );
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().recipient,
        f.recipient
    );
}

#[test]
fn evidence_for_other_battery_or_request_is_rejected() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.grant(&f.collector, ActorRole::Collector, true);
    for (field, expected) in [
        (0, Error::EvidenceBatteryMismatch),
        (1, Error::EvidenceRequestMismatch),
        (2, Error::InvalidEvidence),
        (3, Error::InvalidEvidence),
        (4, Error::InvalidEvidence),
    ] {
        let mut ev = f.ev(EvidenceKind::Collection);
        match field {
            0 => ev.battery_id = String::from_str(&f.e, "BYE-000002"),
            1 => ev.request_id = BytesN::from_array(&f.e, &[99; 32]),
            2 => ev.kind = EvidenceKind::Recycling,
            3 => ev.version = 2,
            _ => ev.payload_hash = BytesN::from_array(&f.e, &[0; 32]),
        }
        f.collection_auth(&ev, &[&f.collector, &f.service]);
        assert_eq!(
            f.client()
                .try_confirm_collection(&f.bid(), &f.rid(), &f.collector, &ev),
            Err(Ok(soroban_sdk::Error::from(expected)))
        );
        assert_eq!(
            f.client().get_battery(&f.bid()).unwrap().state,
            BatteryState::Returned
        );
    }
}

#[test]
fn recycling_cannot_skip_collection_or_repeat() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.grant(&f.recycler, ActorRole::Recycler, true);
    let ev = f.ev(EvidenceKind::Recycling);
    f.authorize(
        "confirm_recycling",
        (f.bid(), f.rid(), &f.recycler, &ev).into_val(&f.e),
        &[&f.recycler],
    );
    assert_eq!(
        f.client()
            .try_confirm_recycling(&f.bid(), &f.rid(), &f.recycler, &ev),
        Err(Ok(soroban_sdk::Error::from(Error::InvalidState)))
    );
    f.collect();
    f.recycle();
    assert_eq!(
        f.client().get_battery(&f.bid()).unwrap().reward_state,
        RewardState::Pending
    );
    f.authorize(
        "confirm_recycling",
        (f.bid(), f.rid(), &f.recycler, &ev).into_val(&f.e),
        &[&f.recycler],
    );
    assert_eq!(
        f.client()
            .try_confirm_recycling(&f.bid(), &f.rid(), &f.recycler, &ev),
        Err(Ok(soroban_sdk::Error::from(Error::InvalidState)))
    );
    let collection = f.ev(EvidenceKind::Collection);
    f.collection_auth(&collection, &[&f.collector, &f.service]);
    assert_eq!(
        f.client()
            .try_confirm_collection(&f.bid(), &f.rid(), &f.collector, &collection),
        Err(Ok(soroban_sdk::Error::from(Error::RequestNotOpen)))
    );
}

#[test]
fn revoked_collector_is_rejected_even_with_both_signatures() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.grant(&f.collector, ActorRole::Collector, true);
    f.grant(&f.collector, ActorRole::Collector, false);
    let ev = f.ev(EvidenceKind::Collection);
    f.collection_auth(&ev, &[&f.collector, &f.service]);
    assert_eq!(
        f.client()
            .try_confirm_collection(&f.bid(), &f.rid(), &f.collector, &ev),
        Err(Ok(soroban_sdk::Error::from(Error::RoleNotGranted)))
    );
}

#[test]
fn user_actions_require_service_and_auth_is_bound_to_arguments() {
    let f = Fixture::new();
    f.register();
    f.e.set_auths(&[]);
    assert!(f
        .client()
        .try_open_return(&f.bid(), &f.rid(), &f.recipient)
        .is_err());
    f.authorize(
        "open_return",
        (f.bid(), f.rid(), &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    let attacker = Address::generate(&f.e);
    assert!(f
        .client()
        .try_open_return(&f.bid(), &f.rid(), &attacker)
        .is_err());
    assert_eq!(f.client().get_request(&f.rid()), None);
    f.open();
    f.e.set_auths(&[]);
    assert!(f.client().try_cancel_return(&f.bid(), &f.rid()).is_err());
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().state,
        RequestState::Open
    );
}

#[test]
fn cancelled_claim_cannot_be_collected_and_wrong_claim_cannot_be_substituted() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.authorize(
        "cancel_return",
        (f.bid(), f.rid()).into_val(&f.e),
        &[&f.service],
    );
    f.client().cancel_return(&f.bid(), &f.rid());
    f.grant(&f.collector, ActorRole::Collector, true);
    let ev = f.ev(EvidenceKind::Collection);
    f.collection_auth(&ev, &[&f.collector, &f.service]);
    assert_eq!(
        f.client()
            .try_confirm_collection(&f.bid(), &f.rid(), &f.collector, &ev),
        Err(Ok(soroban_sdk::Error::from(Error::RequestMismatch)))
    );
    let other_battery = String::from_str(&f.e, "BYE-000002");
    f.authorize(
        "register_battery",
        (&other_battery, f.hash()).into_val(&f.e),
        &[&f.admin],
    );
    f.client().register_battery(&other_battery, &f.hash());
    f.authorize(
        "open_return",
        (&other_battery, f.rid(), &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client()
            .try_open_return(&other_battery, &f.rid(), &f.recipient),
        Err(Ok(soroban_sdk::Error::from(Error::RequestIdAlreadyUsed)))
    );
}

#[test]
fn recycling_requires_recycler_signature_and_correct_evidence() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    f.grant(&f.recycler, ActorRole::Recycler, true);
    let ev = f.ev(EvidenceKind::Recycling);
    f.e.set_auths(&[]);
    assert!(f
        .client()
        .try_confirm_recycling(&f.bid(), &f.rid(), &f.recycler, &ev)
        .is_err());
    let mut bad = ev.clone();
    bad.battery_id = String::from_str(&f.e, "BYE-000002");
    f.authorize(
        "confirm_recycling",
        (f.bid(), f.rid(), &f.recycler, &bad).into_val(&f.e),
        &[&f.recycler],
    );
    assert_eq!(
        f.client()
            .try_confirm_recycling(&f.bid(), &f.rid(), &f.recycler, &bad),
        Err(Ok(soroban_sdk::Error::from(Error::EvidenceBatteryMismatch)))
    );
    f.grant(&f.recycler, ActorRole::Recycler, false);
    f.authorize(
        "confirm_recycling",
        (f.bid(), f.rid(), &f.recycler, &ev).into_val(&f.e),
        &[&f.recycler],
    );
    assert_eq!(
        f.client()
            .try_confirm_recycling(&f.bid(), &f.rid(), &f.recycler, &ev),
        Err(Ok(soroban_sdk::Error::from(Error::RoleNotGranted)))
    );
}

#[test]
fn evidence_commitment_matches_xdr_sha256_and_is_domain_bound() {
    use sha2::{Digest, Sha256};
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    let ev = f.ev(EvidenceKind::Collection);
    let encoded = (
        String::from_str(&f.e, "BYETERY_EVIDENCE_V1"),
        f.e.ledger().network_id(),
        f.id.clone(),
        ev.clone(),
    )
        .to_xdr(&f.e);
    let expected: [u8; 32] = Sha256::digest(encoded.iter().collect::<std::vec::Vec<_>>()).into();
    let actual = f
        .client()
        .get_battery(&f.bid())
        .unwrap()
        .collection_hash
        .unwrap();
    assert_eq!(actual.to_array(), expected);
    for altered in [
        (
            String::from_str(&f.e, "BYETERY_EVIDENCE_V2"),
            f.e.ledger().network_id(),
            f.id.clone(),
            ev.clone(),
        ),
        (
            String::from_str(&f.e, "BYETERY_EVIDENCE_V1"),
            BytesN::from_array(&f.e, &[99; 32]),
            f.id.clone(),
            ev.clone(),
        ),
        (
            String::from_str(&f.e, "BYETERY_EVIDENCE_V1"),
            f.e.ledger().network_id(),
            Address::generate(&f.e),
            ev.clone(),
        ),
    ] {
        let hash: [u8; 32] =
            Sha256::digest(altered.to_xdr(&f.e).iter().collect::<std::vec::Vec<_>>()).into();
        assert_ne!(actual.to_array(), hash);
    }
    let mut changed_payload = ev;
    changed_payload.payload_hash = BytesN::from_array(&f.e, &[4; 32]);
    let other: BytesN<32> = f.e.as_contract(&f.id, || {
        evidence_hash(
            &f.e,
            &f.bid(),
            &f.rid(),
            &changed_payload,
            EvidenceKind::Collection,
        )
    });
    assert_ne!(actual, other);
}

#[test]
fn archived_battery_and_cancelled_request_are_restored_not_recreated() {
    use soroban_sdk::testutils::storage::Persistent;
    let f = Fixture::new();
    f.register();
    f.open();
    f.authorize(
        "cancel_return",
        (f.bid(), f.rid()).into_val(&f.e),
        &[&f.service],
    );
    f.client().cancel_return(&f.bid(), &f.rid());
    let before = f.client().get_battery(&f.bid()).unwrap();
    let (battery_ttl, request_ttl) = f.e.as_contract(&f.id, || {
        (
            f.e.storage()
                .persistent()
                .get_ttl(&DataKey::Battery(f.bid())),
            f.e.storage()
                .persistent()
                .get_ttl(&DataKey::Request(f.rid())),
        )
    });
    let expired_sequence = f.e.ledger().sequence() + battery_ttl.max(request_ttl) + 1;
    f.e.ledger()
        .with_mut(|l| l.sequence_number = expired_sequence);
    // Persistent entries retain their value after TTL expiry; the host restores them.
    f.authorize(
        "register_battery",
        (f.bid(), f.hash()).into_val(&f.e),
        &[&f.admin],
    );
    assert_eq!(
        f.client().try_register_battery(&f.bid(), &f.hash()),
        Err(Ok(soroban_sdk::Error::from(Error::BatteryAlreadyExists)))
    );
    f.authorize(
        "open_return",
        (f.bid(), f.rid(), &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().try_open_return(&f.bid(), &f.rid(), &f.recipient),
        Err(Ok(soroban_sdk::Error::from(Error::RequestIdAlreadyUsed)))
    );
    assert_eq!(f.client().get_battery(&f.bid()), Some(before));
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().state,
        RequestState::Cancelled
    );
    f.e.as_contract(&f.id, || {
        assert!(
            f.e.storage()
                .persistent()
                .get_ttl(&DataKey::Battery(f.bid()))
                > 0
        );
        assert!(
            f.e.storage()
                .persistent()
                .get_ttl(&DataKey::Request(f.rid()))
                > 0
        );
    });
}

#[test]
fn prefunded_green_test_pays_exactly_once_to_locked_recipient() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    f.recycle();
    let token = token::Client::new(&f.e, &f.token);
    assert_eq!(token.symbol(), String::from_str(&f.e, "GREENTEST"));
    assert_eq!(token.decimals(), 7);
    assert_eq!(token.balance(&f.id), 0);
    f.fund(200_000_000);
    assert_eq!(token.balance(&f.id), 200_000_000);
    assert_eq!(token.balance(&f.recipient), 0);
    f.pay_auth();
    let receipt = f.client().pay_reward(&f.bid());
    assert_eq!(receipt.recipient, f.recipient);
    assert_eq!(receipt.amount, 100_000_000);
    assert_eq!(receipt.token, f.token);
    assert_eq!(token.balance(&f.id), 100_000_000);
    assert_eq!(token.balance(&f.recipient), 100_000_000);
    assert_eq!(
        f.client().get_battery(&f.bid()).unwrap().reward_state,
        RewardState::Sent
    );
    // Fresh authorization, as with a client retry after losing the first response.
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(Error::RewardAlreadySent)))
    );
    assert_eq!(token.balance(&f.recipient), 100_000_000);
    assert_eq!(token.balance(&f.id), 100_000_000);
}

#[test]
fn payment_rejects_missing_service_and_early_lifecycle_states() {
    let f = Fixture::new();
    f.register();
    f.fund(100_000_000);
    f.e.set_auths(&[]);
    assert!(f.client().try_pay_reward(&f.bid()).is_err());
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(Error::RewardNotEligible)))
    );
    f.open();
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(Error::RewardNotEligible)))
    );
    f.collect();
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(Error::RewardNotEligible)))
    );
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.id),
        100_000_000
    );
}

#[test]
fn insufficient_funds_keep_pending_then_funding_allows_retry() {
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    f.recycle();
    f.fund(99_999_999);
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(
            Error::InsufficientRewardBalance
        )))
    );
    let b = f.client().get_battery(&f.bid()).unwrap();
    assert_eq!(b.state, BatteryState::Recycled);
    assert_eq!(b.reward_state, RewardState::Pending);
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.id),
        99_999_999
    );
    f.fund(1);
    f.pay_auth();
    assert_eq!(
        f.client().pay_reward(&f.bid()).reward_state,
        RewardState::Sent
    );
}

#[test]
fn token_rejection_rolls_back_sent_write_and_emits_no_payment_event() {
    use soroban_sdk::{testutils::Events, Event};
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    f.recycle();
    f.fund(100_000_000);
    f.recipient_authorized(false);
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.id),
        100_000_000
    );
    f.pay_auth();
    assert!(f.client().try_pay_reward(&f.bid()).is_err());
    let failed_events = f.e.events().all();
    assert_eq!(
        f.client().get_battery(&f.bid()).unwrap().reward_state,
        RewardState::Pending
    );
    assert_eq!(
        f.client().get_battery(&f.bid()).unwrap().state,
        BatteryState::Recycled
    );
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.id),
        100_000_000
    );
    assert_eq!(token::Client::new(&f.e, &f.token).balance(&f.recipient), 0);
    let expected = RewardSent {
        battery_id: f.bid(),
        request_id: f.rid(),
        recipient: f.recipient.clone(),
        token: f.token.clone(),
        amount: 100_000_000,
    }
    .to_xdr(&f.e, &f.id);
    assert!(!failed_events
        .events()
        .iter()
        .any(|event| event == &expected));
    f.recipient_authorized(true);
    f.pay_auth();
    assert_eq!(
        f.client().pay_reward(&f.bid()).reward_state,
        RewardState::Sent
    );
}

#[test]
fn archived_paid_battery_and_confirmed_request_cannot_be_reused_or_repaid() {
    use soroban_sdk::testutils::storage::Persistent;
    let f = Fixture::new();
    f.register();
    f.open();
    f.collect();
    f.recycle();
    f.fund(200_000_000);
    f.pay_auth();
    f.client().pay_reward(&f.bid());
    let before = f.client().get_battery(&f.bid()).unwrap();
    let ttl = f.e.as_contract(&f.id, || {
        f.e.storage()
            .persistent()
            .get_ttl(&DataKey::Battery(f.bid()))
            .max(
                f.e.storage()
                    .persistent()
                    .get_ttl(&DataKey::Request(f.rid())),
            )
    });
    f.e.ledger().with_mut(|l| l.sequence_number += ttl + 1);
    // There is enough remaining balance for a second reward, so the lifecycle guard
    // (not an empty fund) must prevent duplicate payment after restoration.
    f.pay_auth();
    assert_eq!(
        f.client().try_pay_reward(&f.bid()),
        Err(Ok(soroban_sdk::Error::from(Error::RewardAlreadySent)))
    );
    f.authorize(
        "register_battery",
        (f.bid(), f.hash()).into_val(&f.e),
        &[&f.admin],
    );
    assert_eq!(
        f.client().try_register_battery(&f.bid(), &f.hash()),
        Err(Ok(soroban_sdk::Error::from(Error::BatteryAlreadyExists)))
    );
    let other = String::from_str(&f.e, "BYE-000002");
    f.authorize(
        "register_battery",
        (&other, f.hash()).into_val(&f.e),
        &[&f.admin],
    );
    f.client().register_battery(&other, &f.hash());
    f.authorize(
        "open_return",
        (&other, f.rid(), &f.recipient).into_val(&f.e),
        &[&f.service],
    );
    assert_eq!(
        f.client().try_open_return(&other, &f.rid(), &f.recipient),
        Err(Ok(soroban_sdk::Error::from(Error::RequestIdAlreadyUsed)))
    );
    assert_eq!(f.client().get_battery(&f.bid()), Some(before));
    assert_eq!(
        f.client().get_request(&f.rid()).unwrap().state,
        RequestState::Confirmed
    );
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.recipient),
        100_000_000
    );
    assert_eq!(
        token::Client::new(&f.e, &f.token).balance(&f.id),
        100_000_000
    );
}

#[test]
fn successful_mutations_emit_exact_business_events() {
    use soroban_sdk::{testutils::Events, Event};
    let f = Fixture::new();
    f.register();
    assert_eq!(
        f.e.events().all().filter_by_contract(&f.id),
        [BatteryRegistered {
            battery_id: f.bid(),
            registration_hash: f.hash()
        }
        .to_xdr(&f.e, &f.id)]
    );
    f.open();
    assert_eq!(
        f.e.events().all().filter_by_contract(&f.id),
        [ReturnOpened {
            battery_id: f.bid(),
            request_id: f.rid()
        }
        .to_xdr(&f.e, &f.id)]
    );
    f.collect();
    let collection_events = f.e.events().all().filter_by_contract(&f.id);
    let b = f.client().get_battery(&f.bid()).unwrap();
    assert_eq!(
        collection_events,
        [CollectionConfirmed {
            battery_id: f.bid(),
            request_id: f.rid(),
            collector: f.collector.clone(),
            collection_hash: b.collection_hash.unwrap()
        }
        .to_xdr(&f.e, &f.id)]
    );
    f.recycle();
    let recycling_events = f.e.events().all().filter_by_contract(&f.id);
    let b = f.client().get_battery(&f.bid()).unwrap();
    assert_eq!(
        recycling_events,
        [RecyclingConfirmed {
            battery_id: f.bid(),
            request_id: f.rid(),
            recycler: f.recycler.clone(),
            recycling_hash: b.recycling_hash.unwrap(),
            reward_state: RewardState::Pending
        }
        .to_xdr(&f.e, &f.id)]
    );
    f.fund(100_000_000);
    f.pay_auth();
    f.client().pay_reward(&f.bid());
    assert_eq!(
        f.e.events().all().filter_by_contract(&f.id),
        [RewardSent {
            battery_id: f.bid(),
            request_id: f.rid(),
            recipient: f.recipient.clone(),
            token: f.token.clone(),
            amount: 100_000_000
        }
        .to_xdr(&f.e, &f.id)]
    );
}
