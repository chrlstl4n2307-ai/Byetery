#![no_std]

mod types;
pub use types::*;
pub mod events;
use events::*;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, token, xdr::ToXdr, Address, Bytes, BytesN, Env,
    String,
};
use types::DataKey;

pub const TESTNET_PASSPHRASE: &[u8] = b"Test SDF Network ; September 2015";

#[contract]
pub struct Byetery;

fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

fn check_id(e: &Env, id: &String) {
    if id.is_empty() || id.len() > 32 {
        panic_with_error!(e, Error::InvalidBatteryId);
    }
    let mut bytes = [0u8; 32];
    id.copy_into_slice(&mut bytes[..id.len() as usize]);
    if !bytes[..id.len() as usize]
        .iter()
        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || *b == b'-')
    {
        panic_with_error!(e, Error::InvalidBatteryId);
    }
}

fn check_hash(e: &Env, hash: &BytesN<32>) {
    if hash == &BytesN::from_array(e, &[0; 32]) {
        panic_with_error!(e, Error::InvalidEvidence);
    }
}

// No temporary storage or deletion for identities, cancelled requests or paid records.
// Archived persistent entries must be restored by the host/client, never recreated.
fn touch(e: &Env, key: &DataKey) {
    let target = e.storage().max_ttl().min(120_000);
    e.storage().persistent().extend_ttl(key, target / 2, target);
    e.storage().instance().extend_ttl(target / 2, target);
}

fn save_battery(e: &Env, id: &String, b: &Battery) {
    let key = DataKey::Battery(id.clone());
    e.storage().persistent().set(&key, b);
    touch(e, &key);
}

fn save_request(e: &Env, id: &BytesN<32>, r: &ReturnRequest) {
    let key = DataKey::Request(id.clone());
    e.storage().persistent().set(&key, r);
    touch(e, &key);
}

fn battery(e: &Env, id: &String) -> Battery {
    check_id(e, id);
    e.storage()
        .persistent()
        .get(&DataKey::Battery(id.clone()))
        .unwrap_or_else(|| panic_with_error!(e, Error::BatteryNotFound))
}

fn request(e: &Env, id: &BytesN<32>) -> ReturnRequest {
    e.storage()
        .persistent()
        .get(&DataKey::Request(id.clone()))
        .unwrap_or_else(|| panic_with_error!(e, Error::RequestNotFound))
}

fn matching_request(e: &Env, bid: &String, rid: &BytesN<32>, b: &Battery) -> ReturnRequest {
    let r = request(e, rid);
    if r.battery_id != *bid || b.request_id.as_ref() != Some(rid) {
        panic_with_error!(e, Error::RequestMismatch);
    }
    r
}

fn role(e: &Env, actor: &Address, role: ActorRole) {
    if !e
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::Role(actor.clone(), role))
        .unwrap_or(false)
    {
        panic_with_error!(e, Error::RoleNotGranted);
    }
}

/// Canonical XDR of (domain, network_id, contract_address, Evidence), then SHA-256.
fn evidence_hash(
    e: &Env,
    bid: &String,
    rid: &BytesN<32>,
    ev: &Evidence,
    kind: EvidenceKind,
) -> BytesN<32> {
    if ev.battery_id != *bid {
        panic_with_error!(e, Error::EvidenceBatteryMismatch);
    }
    if ev.request_id != *rid {
        panic_with_error!(e, Error::EvidenceRequestMismatch);
    }
    if ev.version != 1 || ev.kind != kind {
        panic_with_error!(e, Error::InvalidEvidence);
    }
    check_hash(e, &ev.payload_hash);
    let encoded = (
        String::from_str(e, "BYETERY_EVIDENCE_V1"),
        e.ledger().network_id(),
        e.current_contract_address(),
        ev.clone(),
    )
        .to_xdr(e);
    e.crypto().sha256(&encoded).into()
}

#[contractimpl]
impl Byetery {
    pub fn __constructor(
        e: Env,
        admin: Address,
        service: Address,
        reward_token: Address,
        reward_amount: i128,
    ) {
        // Explicit administrator authorization, independent of the deployment source.
        admin.require_auth();
        let testnet: BytesN<32> = e
            .crypto()
            .sha256(&Bytes::from_slice(&e, TESTNET_PASSPHRASE))
            .into();
        if e.ledger().network_id() != testnet
            || reward_amount <= 0
            || reward_token == e.current_contract_address()
        {
            panic_with_error!(&e, Error::InvalidConfiguration);
        }
        let c = Config {
            schema_version: 1,
            admin,
            service,
            reward_token,
            reward_amount,
        };
        e.storage().instance().set(&DataKey::Config, &c);
        let target = e.storage().max_ttl().min(120_000);
        e.storage().instance().extend_ttl(target / 2, target);
        Configured { config: c }.publish(&e);
    }

    pub fn set_role(e: Env, actor: Address, actor_role: ActorRole, enabled: bool) -> bool {
        config(&e).admin.require_auth();
        let key = DataKey::Role(actor.clone(), actor_role.clone());
        let previous = e
            .storage()
            .persistent()
            .get::<_, bool>(&key)
            .unwrap_or(false);
        if previous == enabled {
            return false;
        }
        e.storage().persistent().set(&key, &enabled);
        touch(&e, &key);
        RoleChanged {
            actor,
            role: actor_role,
            enabled,
        }
        .publish(&e);
        true
    }

    pub fn register_battery(e: Env, battery_id: String, registration_hash: BytesN<32>) -> Battery {
        config(&e).admin.require_auth();
        check_id(&e, &battery_id);
        if e.storage()
            .persistent()
            .has(&DataKey::Battery(battery_id.clone()))
        {
            panic_with_error!(&e, Error::BatteryAlreadyExists);
        }
        check_hash(&e, &registration_hash);
        let b = Battery {
            state: BatteryState::Registered,
            registration_hash,
            request_id: None,
            collector: None,
            collection_hash: None,
            recycler: None,
            recycling_hash: None,
            reward_state: RewardState::NotEligible,
        };
        save_battery(&e, &battery_id, &b);
        BatteryRegistered {
            battery_id,
            registration_hash: b.registration_hash.clone(),
        }
        .publish(&e);
        b
    }

    /// Trust boundary: service validates Supabase identity and minimal wallet proof off-chain.
    /// Request IDs must be CSPRNG-generated server-side; the contract enforces non-reuse.
    pub fn open_return(
        e: Env,
        battery_id: String,
        request_id: BytesN<32>,
        recipient: Address,
    ) -> BytesN<32> {
        config(&e).service.require_auth();
        let mut b = battery(&e, &battery_id);
        if e.storage()
            .persistent()
            .has(&DataKey::Request(request_id.clone()))
        {
            panic_with_error!(&e, Error::RequestIdAlreadyUsed);
        }
        if b.state != BatteryState::Registered
            || b.request_id.is_some()
            || b.reward_state != RewardState::NotEligible
        {
            panic_with_error!(&e, Error::InvalidState);
        }
        if recipient == e.current_contract_address() {
            panic_with_error!(&e, Error::InvalidRecipient);
        }
        let r = ReturnRequest {
            battery_id: battery_id.clone(),
            recipient,
            state: RequestState::Open,
        };
        save_request(&e, &request_id, &r);
        b.state = BatteryState::Returned;
        b.request_id = Some(request_id.clone());
        save_battery(&e, &battery_id, &b);
        ReturnOpened {
            battery_id,
            request_id: request_id.clone(),
        }
        .publish(&e);
        request_id
    }

    /// Service attests that the authenticated requester owns the request being cancelled.
    pub fn cancel_return(e: Env, battery_id: String, request_id: BytesN<32>) -> BatteryState {
        config(&e).service.require_auth();
        let mut b = battery(&e, &battery_id);
        let mut r = matching_request(&e, &battery_id, &request_id, &b);
        if r.state != RequestState::Open {
            panic_with_error!(&e, Error::RequestNotOpen);
        }
        if b.state != BatteryState::Returned {
            panic_with_error!(&e, Error::InvalidState);
        }
        r.state = RequestState::Cancelled;
        save_request(&e, &request_id, &r);
        b.state = BatteryState::Registered;
        b.request_id = None;
        save_battery(&e, &battery_id, &b);
        ReturnCancelled {
            battery_id,
            request_id,
        }
        .publish(&e);
        b.state
    }

    pub fn confirm_collection(
        e: Env,
        battery_id: String,
        request_id: BytesN<32>,
        collector: Address,
        evidence: Evidence,
    ) -> BatteryState {
        collector.require_auth();
        config(&e).service.require_auth();
        role(&e, &collector, ActorRole::Collector);
        let mut b = battery(&e, &battery_id);
        let mut r = matching_request(&e, &battery_id, &request_id, &b);
        if r.state != RequestState::Open {
            panic_with_error!(&e, Error::RequestNotOpen);
        }
        if b.state != BatteryState::Returned {
            panic_with_error!(&e, Error::InvalidState);
        }
        let commitment = evidence_hash(
            &e,
            &battery_id,
            &request_id,
            &evidence,
            EvidenceKind::Collection,
        );
        r.state = RequestState::Confirmed;
        save_request(&e, &request_id, &r);
        b.state = BatteryState::Collected;
        b.collector = Some(collector.clone());
        b.collection_hash = Some(commitment.clone());
        save_battery(&e, &battery_id, &b);
        CollectionConfirmed {
            battery_id,
            request_id,
            collector,
            collection_hash: commitment,
        }
        .publish(&e);
        b.state
    }

    pub fn confirm_recycling(
        e: Env,
        battery_id: String,
        request_id: BytesN<32>,
        recycler: Address,
        evidence: Evidence,
    ) -> RecyclingResult {
        recycler.require_auth();
        role(&e, &recycler, ActorRole::Recycler);
        let mut b = battery(&e, &battery_id);
        let r = matching_request(&e, &battery_id, &request_id, &b);
        if b.state != BatteryState::Collected
            || r.state != RequestState::Confirmed
            || b.reward_state != RewardState::NotEligible
        {
            panic_with_error!(&e, Error::InvalidState);
        }
        let commitment = evidence_hash(
            &e,
            &battery_id,
            &request_id,
            &evidence,
            EvidenceKind::Recycling,
        );
        b.state = BatteryState::Recycled;
        b.recycler = Some(recycler.clone());
        b.recycling_hash = Some(commitment.clone());
        b.reward_state = RewardState::Pending;
        save_battery(&e, &battery_id, &b);
        touch(&e, &DataKey::Request(request_id.clone()));
        RecyclingConfirmed {
            battery_id,
            request_id,
            recycler,
            recycling_hash: commitment,
            reward_state: RewardState::Pending,
        }
        .publish(&e);
        RecyclingResult {
            battery_state: b.state,
            reward_state: b.reward_state,
        }
    }

    /// Prefunded token transfer and Sent transition commit atomically.
    pub fn pay_reward(e: Env, battery_id: String) -> RewardReceipt {
        let c = config(&e);
        c.service.require_auth();
        let mut b = battery(&e, &battery_id);
        if b.reward_state == RewardState::Sent {
            panic_with_error!(&e, Error::RewardAlreadySent);
        }
        if b.state != BatteryState::Recycled || b.reward_state != RewardState::Pending {
            panic_with_error!(&e, Error::RewardNotEligible);
        }
        let rid = b
            .request_id
            .clone()
            .unwrap_or_else(|| panic_with_error!(&e, Error::RequestMismatch));
        let r = matching_request(&e, &battery_id, &rid, &b);
        if r.state != RequestState::Confirmed {
            panic_with_error!(&e, Error::RequestMismatch);
        }
        let contract = e.current_contract_address();
        let asset = token::Client::new(&e, &c.reward_token);
        if asset.balance(&contract) < c.reward_amount {
            panic_with_error!(&e, Error::InsufficientRewardBalance);
        }
        // Effects before external call. Any token failure rolls back these writes.
        b.reward_state = RewardState::Sent;
        save_battery(&e, &battery_id, &b);
        touch(&e, &DataKey::Request(rid.clone()));
        // Soroban implicitly authorizes the current contract as the direct caller.
        asset.transfer(&contract, &r.recipient, &c.reward_amount);
        RewardSent {
            battery_id,
            request_id: rid,
            recipient: r.recipient.clone(),
            token: c.reward_token.clone(),
            amount: c.reward_amount,
        }
        .publish(&e);
        RewardReceipt {
            recipient: r.recipient,
            token: c.reward_token,
            amount: c.reward_amount,
            reward_state: RewardState::Sent,
        }
    }

    pub fn get_config(e: Env) -> Config {
        config(&e)
    }

    pub fn has_role(e: Env, actor: Address, actor_role: ActorRole) -> bool {
        e.storage()
            .persistent()
            .get(&DataKey::Role(actor, actor_role))
            .unwrap_or(false)
    }

    pub fn get_battery(e: Env, battery_id: String) -> Option<Battery> {
        check_id(&e, &battery_id);
        e.storage().persistent().get(&DataKey::Battery(battery_id))
    }

    pub fn get_request(e: Env, request_id: BytesN<32>) -> Option<ReturnRequest> {
        e.storage().persistent().get(&DataKey::Request(request_id))
    }
}

#[cfg(test)]
mod test;
