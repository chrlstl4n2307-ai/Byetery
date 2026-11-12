//! Protected, single-use v3 child request. No asynchronous call surrounds key use.
use crate::{phased, require, Result, COLLECTOR, NETWORK};
use ed25519_dalek::{Signer, SigningKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use soroban_cli::xdr::*;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct KeyUseFence {
    pub schema: String,
    pub operation_id: String,
    pub context_hash: String,
    pub instance_id: String,
    pub lease_generation: String,
    pub not_after: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FencedRequest {
    pub version: u32,
    pub phase: String,
    pub network_passphrase: String,
    pub transaction_xdr: String,
    pub current_ledger: u32,
    pub signature_expiration_ledger: u32,
    pub expected_hash: Option<String>,
    pub key_use: KeyUseFence,
}
fn milliseconds() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "ClockInvalid")?
        .as_millis()
        .try_into()
        .map_err(|_| "ClockInvalid")
}
fn hex(s: &str, length: usize) -> bool {
    s.len() == length
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
struct Deadline {
    not_after: u64,
    origin: u64,
    started: Instant,
}
impl Deadline {
    fn new(fence: &KeyUseFence) -> Result<Self> {
        let origin = milliseconds()?;
        require(
            fence.schema == "BYETERY_D324_KEY_USE_V1"
                && hex(&fence.context_hash, 64)
                && hex(&fence.instance_id, 64)
                && fence.operation_id.len() == 36
                && fence.operation_id.bytes().enumerate().all(|(i, b)| {
                    if [8, 13, 18, 23].contains(&i) {
                        b == b'-'
                    } else {
                        b.is_ascii_hexdigit() && !b.is_ascii_uppercase()
                    }
                })
                && !fence.lease_generation.is_empty()
                && fence.lease_generation.len() <= 19
                && !fence.lease_generation.starts_with('0')
                && fence.lease_generation.bytes().all(|b| b.is_ascii_digit()),
            "D324KeyUseContextRejected",
        )?;
        require(
            origin < fence.not_after && fence.not_after - origin <= 4_500_000,
            "D324KeyUseExpired",
        )?;
        Ok(Self {
            not_after: fence.not_after,
            origin,
            started: Instant::now(),
        })
    }
    fn check(&self) -> Result<()> {
        require(
            milliseconds()? < self.not_after
                && self.started.elapsed().as_millis() < u128::from(self.not_after - self.origin),
            "D324KeyUseExpired",
        )
    }
}
// Mirrors the CLI's fixed Secure Store mapping and SEP-5 derivation. The only
// additional access to key bytes is this private scope, zeroized on every exit.
fn load_key(public: &str) -> Result<SigningKey> {
    let role = match public {
        crate::ADMIN => "admin",
        crate::SERVICE => "service",
        COLLECTOR => "collector",
        crate::RECYCLER => "recycler",
        _ => return Err("SignerNotAllowed"),
    };
    let name = format!("secure_store:org.stellar.cli-byetery-tn20260926-{role}");
    let entry =
        keyring::Entry::new(&name, &whoami::username()).map_err(|_| "SecureStoreUnavailable")?;
    let text = Zeroizing::new(entry.get_password().map_err(|_| "SecureStoreUnavailable")?);
    let phrase: sep5::SeedPhrase = text.parse().map_err(|_| "SecureStoreUnavailable")?;
    let bytes = Zeroizing::new(
        phrase
            .from_path_index(0, None)
            .map_err(|_| "SecureStoreUnavailable")?
            .private()
            .0,
    );
    Ok(SigningKey::from_bytes(&bytes))
}
fn guarded_sign(
    public: &str,
    payload: &[u8; 32],
    check: impl Fn() -> Result<()>,
    load: impl FnOnce() -> Result<SigningKey>,
    approve: &mut impl FnMut(&str) -> Result<()>,
) -> Result<[u8; 64]> {
    check()?;
    approve("LOAD")?;
    check()?;
    let key = load()?;
    let expected = stellar_strkey::ed25519::PublicKey::from_string(public)
        .map_err(|_| "IdentityMismatch")?
        .0;
    require(
        key.verifying_key().to_bytes() == expected,
        "IdentityMismatch",
    )?;
    // All potentially blocking credential I/O and derivation have completed.
    // This check and the Ed25519 call share one synchronous stack, with no I/O.
    approve("SIGN")?;
    check()?;
    Ok(key.sign(payload).to_bytes())
}
pub fn sign_fenced(
    request: FencedRequest,
    approve: &mut impl FnMut(&str) -> Result<()>,
) -> Result<phased::PhasedResponse> {
    require(request.version == 3, "UnsupportedVersion")?;
    let gate = Deadline::new(&request.key_use)?;
    let phase = phased::PhasedRequest {
        version: 3,
        phase: request.phase,
        network_passphrase: request.network_passphrase,
        transaction_xdr: request.transaction_xdr,
        current_ledger: request.current_ledger,
        signature_expiration_ledger: request.signature_expiration_ledger,
        expected_hash: request.expected_hash,
    };
    let mut valid = phased::validate_phase(&phase, milliseconds()? / 1000)?;
    require(crate::reserved(&valid.tx), "D324KeyUseContextRejected")?;
    let status = if phase.phase == "authorize" {
        let OperationBody::InvokeHostFunction(body) = &mut valid
            .tx
            .operations
            .iter_mut()
            .next()
            .ok_or("InvalidXdr")?
            .body
        else {
            return Err("InvalidXdr");
        };
        for auth in body.auth.iter_mut() {
            let invocation = auth.root_invocation.clone();
            let (c, v2) = match &mut auth.credentials {
                SorobanCredentials::Address(c) => (c, false),
                SorobanCredentials::AddressV2(c) => (c, true),
                _ => continue,
            };
            let preimage = if v2 {
                HashIdPreimage::SorobanAuthorizationWithAddress(
                    HashIdPreimageSorobanAuthorizationWithAddress {
                        network_id: Hash(Sha256::digest(NETWORK).into()),
                        address: c.address.clone(),
                        nonce: c.nonce,
                        signature_expiration_ledger: phase.signature_expiration_ledger,
                        invocation,
                    },
                )
            } else {
                HashIdPreimage::SorobanAuthorization(HashIdPreimageSorobanAuthorization {
                    network_id: Hash(Sha256::digest(NETWORK).into()),
                    nonce: c.nonce,
                    signature_expiration_ledger: phase.signature_expiration_ledger,
                    invocation,
                })
            };
            let hash =
                Sha256::digest(preimage.to_xdr(Limits::none()).map_err(|_| "InvalidXdr")?).into();
            let signature = guarded_sign(
                COLLECTOR,
                &hash,
                || gate.check(),
                || load_key(COLLECTOR),
                approve,
            )?;
            let public = stellar_strkey::ed25519::PublicKey::from_string(COLLECTOR)
                .map_err(|_| "IdentityMismatch")?
                .0;
            c.signature_expiration_ledger = phase.signature_expiration_ledger;
            c.signature = ScVal::Vec(Some(ScVec(
                vec![ScVal::Map(Some(
                    ScMap::sorted_from(vec![
                        (
                            ScVal::Symbol(ScSymbol(
                                "public_key".try_into().map_err(|_| "InvalidXdr")?,
                            )),
                            ScVal::Bytes(ScBytes(
                                public.to_vec().try_into().map_err(|_| "InvalidXdr")?,
                            )),
                        ),
                        (
                            ScVal::Symbol(ScSymbol(
                                "signature".try_into().map_err(|_| "InvalidXdr")?,
                            )),
                            ScVal::Bytes(ScBytes(
                                signature.to_vec().try_into().map_err(|_| "InvalidXdr")?,
                            )),
                        ),
                    ])
                    .map_err(|_| "InvalidXdr")?,
                ))]
                .try_into()
                .map_err(|_| "InvalidXdr")?,
            )));
        }
        if valid.method != "confirm_collection" {
            gate.check()?;
            approve("LOAD")?;
            gate.check()?;
            approve("SIGN")?;
            gate.check()?;
        }
        "authorized"
    } else {
        "signed"
    };
    let mut signatures = VecM::default();
    if phase.phase == "sign_envelope" {
        let hash = phased::transaction_hash(&valid.tx)?;
        let signature = guarded_sign(
            valid.source,
            &hash,
            || gate.check(),
            || load_key(valid.source),
            approve,
        )?;
        let public = stellar_strkey::ed25519::PublicKey::from_string(valid.source)
            .map_err(|_| "IdentityMismatch")?
            .0;
        signatures = vec![DecoratedSignature {
            hint: SignatureHint(public[28..].try_into().map_err(|_| "InvalidXdr")?),
            signature: Signature(signature.to_vec().try_into().map_err(|_| "InvalidXdr")?),
        }]
        .try_into()
        .map_err(|_| "InvalidXdr")?;
    }
    gate.check()?;
    let tx = TransactionEnvelope::Tx(TransactionV1Envelope {
        tx: valid.tx,
        signatures,
    });
    Ok(phased::PhasedResponse {
        version: 3,
        status,
        transaction_xdr: tx
            .to_xdr_base64(Limits::none())
            .map_err(|_| "OutputEncodingFailed")?,
        method: valid.method,
        signers: valid.signers.iter().map(|s| s.to_string()).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    fn test_sign(now: &Cell<u64>, cutoff: u64, delay: bool) -> Result<[u8; 64]> {
        let key = SigningKey::from_bytes(&[7; 32]);
        let public = stellar_strkey::ed25519::PublicKey(key.verifying_key().to_bytes()).to_string();
        guarded_sign(
            &public,
            &[1; 32],
            || require(now.get() < cutoff, "D324KeyUseExpired"),
            || {
                if delay {
                    now.set(cutoff);
                }
                Ok(key)
            },
            &mut |_| Ok(()),
        )
    }
    #[test]
    fn synthetic_inside_limit() {
        assert!(test_sign(&Cell::new(9), 10, false).is_ok());
    }
    #[test]
    fn synthetic_exact_limit() {
        assert_eq!(
            test_sign(&Cell::new(10), 10, false).err(),
            Some("D324KeyUseExpired")
        );
    }
    #[test]
    fn synthetic_delay_in_key_loading() {
        assert_eq!(
            test_sign(&Cell::new(9), 10, true).err(),
            Some("D324KeyUseExpired")
        );
    }
    #[test]
    fn revoked_preparation_never_reaches_signature() {
        let revoked = Cell::new(false);
        let key = SigningKey::from_bytes(&[8; 32]);
        let public = stellar_strkey::ed25519::PublicKey(key.verifying_key().to_bytes()).to_string();
        let result = guarded_sign(
            &public,
            &[0; 32],
            || require(!revoked.get(), "D324AuthorityRevoked"),
            || {
                revoked.set(true);
                Ok(key)
            },
            &mut |_| Ok(()),
        );
        assert_eq!(result.err(), Some("D324AuthorityRevoked"));
    }
    #[test]
    fn expired_lease_prevents_loading_a_key() {
        let loads = Cell::new(0);
        let result = guarded_sign(
            crate::ADMIN,
            &[0; 32],
            || Err("D324LeaseExpired"),
            || {
                loads.set(loads.get() + 1);
                Ok(SigningKey::from_bytes(&[9; 32]))
            },
            &mut |_| Ok(()),
        );
        assert_eq!(result.err(), Some("D324LeaseExpired"));
        assert_eq!(loads.get(), 0);
    }
    #[test]
    fn restarted_helper_has_no_default_permission_or_generation() {
        assert!(serde_json::from_str::<FencedRequest>(r#"{"version":3}"#).is_err());
        let fence = KeyUseFence {
            schema: "BYETERY_D324_KEY_USE_V1".into(),
            operation_id: "10000000-0000-0000-0000-000000000001".into(),
            context_hash: "a".repeat(64),
            instance_id: "b".repeat(64),
            lease_generation: "0".into(),
            not_after: milliseconds().unwrap() + 1000,
        };
        assert_eq!(
            Deadline::new(&fence).err().map(|e| e.to_string()),
            Some("D324KeyUseContextRejected".into())
        );
    }
    #[test]
    fn final_parent_response_cannot_resurrect_expired_key_use() {
        let now = Cell::new(9);
        let key = SigningKey::from_bytes(&[6; 32]);
        let public = stellar_strkey::ed25519::PublicKey(key.verifying_key().to_bytes()).to_string();
        let result = guarded_sign(
            &public,
            &[0; 32],
            || require(now.get() < 10, "D324KeyUseExpired"),
            || Ok(key),
            &mut |stage| {
                if stage == "SIGN" {
                    now.set(10);
                }
                Ok(())
            },
        );
        assert_eq!(result.err(), Some("D324KeyUseExpired"));
    }
    #[test]
    fn custody_loss_after_loading_prevents_signature() {
        let key = SigningKey::from_bytes(&[5; 32]);
        let public = stellar_strkey::ed25519::PublicKey(key.verifying_key().to_bytes()).to_string();
        let result = guarded_sign(&public, &[0; 32], || Ok(()), || Ok(key), &mut |stage| {
            require(stage != "SIGN", "ParentUnavailable")
        });
        assert_eq!(result.err(), Some("ParentUnavailable"));
    }
}
