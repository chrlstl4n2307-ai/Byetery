use crate::{ActorRole, Config, RewardState};
use soroban_sdk::{contractevent, Address, BytesN, String};

#[contractevent(topics = ["config"])]
pub struct Configured {
    pub config: Config,
}

#[contractevent(topics = ["role"])]
pub struct RoleChanged {
    #[topic]
    pub actor: Address,
    pub role: ActorRole,
    pub enabled: bool,
}

#[contractevent(topics = ["register"])]
pub struct BatteryRegistered {
    #[topic]
    pub battery_id: String,
    pub registration_hash: BytesN<32>,
}

#[contractevent(topics = ["opened"])]
pub struct ReturnOpened {
    #[topic]
    pub battery_id: String,
    pub request_id: BytesN<32>,
}

#[contractevent(topics = ["cancelled"])]
pub struct ReturnCancelled {
    #[topic]
    pub battery_id: String,
    pub request_id: BytesN<32>,
}

#[contractevent(topics = ["collected"])]
pub struct CollectionConfirmed {
    #[topic]
    pub battery_id: String,
    pub request_id: BytesN<32>,
    pub collector: Address,
    pub collection_hash: BytesN<32>,
}

#[contractevent(topics = ["recycled"])]
pub struct RecyclingConfirmed {
    #[topic]
    pub battery_id: String,
    pub request_id: BytesN<32>,
    pub recycler: Address,
    pub recycling_hash: BytesN<32>,
    pub reward_state: RewardState,
}

#[contractevent(topics = ["paid"])]
pub struct RewardSent {
    #[topic]
    pub battery_id: String,
    pub request_id: BytesN<32>,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
}
