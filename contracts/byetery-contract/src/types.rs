use soroban_sdk::{contracterror, contracttype, Address, BytesN, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BatteryState {
    Registered,
    Returned,
    Collected,
    Recycled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RequestState {
    Open,
    Cancelled,
    Confirmed,
}

/// Failed attempts belong off-chain: a failed transfer rolls back contract writes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RewardState {
    NotEligible,
    Pending,
    Sent,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActorRole {
    Collector,
    Recycler,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub schema_version: u32,
    pub admin: Address,
    pub service: Address,
    pub reward_token: Address,
    pub reward_amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Battery {
    pub state: BatteryState,
    pub registration_hash: BytesN<32>,
    pub request_id: Option<BytesN<32>>,
    pub collector: Option<Address>,
    pub collection_hash: Option<BytesN<32>>,
    pub recycler: Option<Address>,
    pub recycling_hash: Option<BytesN<32>>,
    pub reward_state: RewardState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReturnRequest {
    pub battery_id: String,
    pub recipient: Address,
    pub state: RequestState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EvidenceKind {
    Collection,
    Recycling,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Evidence {
    pub version: u32,
    pub battery_id: String,
    pub request_id: BytesN<32>,
    pub kind: EvidenceKind,
    pub payload_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecyclingResult {
    pub battery_state: BatteryState,
    pub reward_state: RewardState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardReceipt {
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub reward_state: RewardState,
}

#[contracttype]
#[derive(Clone)]
pub(crate) enum DataKey {
    Config,
    Role(Address, ActorRole),
    Battery(String),
    Request(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidBatteryId = 1,
    BatteryAlreadyExists = 2,
    BatteryNotFound = 3,
    RequestIdAlreadyUsed = 4,
    RequestNotFound = 5,
    RequestNotOpen = 6,
    RequestMismatch = 7,
    InvalidState = 8,
    RoleNotGranted = 9,
    InvalidEvidence = 10,
    EvidenceBatteryMismatch = 11,
    EvidenceRequestMismatch = 12,
    RewardNotEligible = 13,
    RewardAlreadySent = 14,
    InvalidConfiguration = 15,
    InvalidRecipient = 16,
    InsufficientRewardBalance = 17,
}
