//! Owner-approved v2 signing seam; v1 validation and signing stay unchanged.
use crate::{require, secure_signer, validate, Request, Result, COLLECTOR, MAX_INPUT, NETWORK};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use soroban_cli::xdr::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhasedRequest {
    pub version: u32,
    pub phase: String,
    pub network_passphrase: String,
    pub transaction_xdr: String,
    pub current_ledger: u32,
    pub signature_expiration_ledger: u32,
    pub expected_hash: Option<String>,
}
#[derive(Serialize)]
pub struct PhasedResponse {
    pub version: u32,
    pub status: &'static str,
    pub transaction_xdr: String,
    pub method: String,
    pub signers: Vec<String>,
}

pub fn transaction_hash(tx: &Transaction) -> Result<[u8; 32]> {
    let p = TransactionSignaturePayload {
        network_id: Hash(Sha256::digest(NETWORK).into()),
        tagged_transaction: TransactionSignaturePayloadTaggedTransaction::Tx(tx.clone()),
    };
    Ok(Sha256::digest(p.to_xdr(Limits::none()).map_err(|_| "InvalidXdr")?).into())
}
pub fn hash_hex(hash: [u8; 32]) -> String {
    hash.iter().map(|b| format!("{b:02x}")).collect()
}

/// Validates a signed address authorization independently of the envelope.
pub fn verify_authorization(auth: &SorobanAuthorizationEntry, expiration: u32) -> Result<()> {
    let (c, v2) = match &auth.credentials {
        SorobanCredentials::SourceAccount => return Ok(()),
        SorobanCredentials::Address(c) => (c, false),
        SorobanCredentials::AddressV2(c) => (c, true),
        _ => return Err("AuthCredentialsNotAllowed"),
    };
    require(crate::address(&c.address)? == COLLECTOR, "WrongAuthSigner")?;
    require(
        c.signature_expiration_ledger == expiration,
        "InvalidExpirationLedger",
    )?;
    let ScVal::Vec(Some(v)) = &c.signature else {
        return Err("InvalidAuthSignature");
    };
    require(v.0.len() == 1, "InvalidAuthSignature")?;
    let ScVal::Map(Some(m)) = &v.0[0] else {
        return Err("InvalidAuthSignature");
    };
    require(m.0.len() == 2, "InvalidAuthSignature")?;
    require(
        matches!(&m.0[0].key, ScVal::Symbol(s) if crate::symbol(s).ok().as_deref()==Some("public_key"))
            && matches!(&m.0[1].key, ScVal::Symbol(s) if crate::symbol(s).ok().as_deref()==Some("signature")),
        "InvalidAuthSignature",
    )?;
    let (ScVal::Bytes(key), ScVal::Bytes(sig)) = (&m.0[0].val, &m.0[1].val) else {
        return Err("InvalidAuthSignature");
    };
    let public = stellar_strkey::ed25519::PublicKey::from_string(COLLECTOR)
        .map_err(|_| "WrongAuthSigner")?
        .0;
    require(key.0.as_slice() == public, "WrongAuthSigner")?;
    let preimage = if v2 {
        HashIdPreimage::SorobanAuthorizationWithAddress(
            HashIdPreimageSorobanAuthorizationWithAddress {
                network_id: Hash(Sha256::digest(NETWORK).into()),
                address: c.address.clone(),
                nonce: c.nonce,
                signature_expiration_ledger: expiration,
                invocation: auth.root_invocation.clone(),
            },
        )
    } else {
        HashIdPreimage::SorobanAuthorization(HashIdPreimageSorobanAuthorization {
            network_id: Hash(Sha256::digest(NETWORK).into()),
            nonce: c.nonce,
            signature_expiration_ledger: expiration,
            invocation: auth.root_invocation.clone(),
        })
    };
    let hash: [u8; 32] =
        Sha256::digest(preimage.to_xdr(Limits::none()).map_err(|_| "InvalidXdr")?).into();
    let key =
        ed25519_dalek::VerifyingKey::from_bytes(&public).map_err(|_| "InvalidAuthSignature")?;
    let sig = ed25519_dalek::Signature::from_slice(&sig.0).map_err(|_| "InvalidAuthSignature")?;
    key.verify_strict(&hash, &sig)
        .map_err(|_| "InvalidAuthSignature")
}

/// Returns the original body. A normalized copy goes through ALL v1 guards.
pub fn validate_phase(r: &PhasedRequest, now: u64) -> Result<crate::Validated> {
    require(r.version == 2, "UnsupportedVersion")?;
    require(
        r.phase == "authorize" || r.phase == "sign_envelope",
        "InvalidPhase",
    )?;
    require(r.transaction_xdr.len() <= MAX_INPUT / 2, "XdrTooLarge")?;
    let env = TransactionEnvelope::from_xdr_base64(
        &r.transaction_xdr,
        Limits {
            depth: 64,
            len: 65536,
        },
    )
    .map_err(|_| "InvalidXdr")?;
    require(
        env.to_xdr_base64(Limits::none())
            .map_err(|_| "InvalidXdr")?
            == r.transaction_xdr,
        "NonCanonicalXdr",
    )?;
    let TransactionEnvelope::Tx(env) = env else {
        return Err("EnvelopeNotAllowed");
    };
    require(env.signatures.is_empty(), "AlreadySignedEnvelope")?;
    let original = env.tx;
    let mut normalized = original.clone();
    if r.phase == "sign_envelope" {
        let OperationBody::InvokeHostFunction(body) = &mut normalized
            .operations
            .iter_mut()
            .next()
            .ok_or("OperationCountNotAllowed")?
            .body
        else {
            return Err("OperationNotAllowed");
        };
        for auth in body.auth.iter_mut() {
            verify_authorization(auth, r.signature_expiration_ledger)?;
            match &mut auth.credentials {
                SorobanCredentials::Address(c) | SorobanCredentials::AddressV2(c) => {
                    c.signature = ScVal::Void;
                    c.signature_expiration_ledger = 0;
                }
                _ => {}
            }
        }
    } else {
        require(r.expected_hash.is_none(), "UnexpectedHash")?;
    }
    let v1 = Request {
        version: 1,
        network_passphrase: r.network_passphrase.clone(),
        current_ledger: r.current_ledger,
        signature_expiration_ledger: r.signature_expiration_ledger,
        transaction_xdr: TransactionEnvelope::Tx(TransactionV1Envelope {
            tx: normalized,
            signatures: VecM::default(),
        })
        .to_xdr_base64(Limits::none())
        .map_err(|_| "InvalidXdr")?,
    };
    let mut validated = validate(&v1, now)?;
    if r.phase == "sign_envelope" {
        require(
            r.expected_hash.as_deref() == Some(hash_hex(transaction_hash(&original)?).as_str()),
            "ExpectedHashMismatch",
        )?;
    }
    validated.tx = original;
    Ok(validated)
}

pub async fn sign_phase(r: PhasedRequest) -> Result<PhasedResponse> {
    use soroban_cli::{
        config::network::Network, print::Print, signer::sign_soroban_authorizations,
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "ClockInvalid")?
        .as_secs();
    let v = validate_phase(&r, now)?;
    let (tx, status) = if r.phase == "authorize" {
        // Only address credentials need a signature; source auth is implicit later.
        let signers = if v.method == "confirm_collection" {
            vec![secure_signer(COLLECTOR)?]
        } else {
            vec![]
        };
        let tx = sign_soroban_authorizations(
            &v.tx,
            &signers,
            r.signature_expiration_ledger,
            NETWORK,
            false,
            &Print::new(true),
        )
        .await
        .map_err(|_| "AuthorizationSigningFailed")?
        .unwrap_or(v.tx);
        (
            TransactionEnvelope::Tx(TransactionV1Envelope {
                tx,
                signatures: VecM::default(),
            }),
            "authorized",
        )
    } else {
        let network = Network {
            rpc_url: "https://soroban-testnet.stellar.org".into(),
            rpc_headers: vec![],
            network_passphrase: NETWORK.into(),
        };
        (
            secure_signer(v.source)?
                .sign_tx(v.tx, &network)
                .await
                .map_err(|_| "EnvelopeSigningFailed")?,
            "signed",
        )
    };
    Ok(PhasedResponse {
        version: 2,
        status,
        transaction_xdr: tx
            .to_xdr_base64(Limits {
                depth: 64,
                len: 65536,
            })
            .map_err(|_| "OutputEncodingFailed")?,
        method: v.method,
        signers: v.signers.iter().map(|s| s.to_string()).collect(),
    })
}
