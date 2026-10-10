//! Testnet-only local signer. No RPC, database, or transaction submit.
use serde::{Deserialize, Serialize};
use soroban_cli::xdr::*;
use std::time::{SystemTime, UNIX_EPOCH};
pub const MAX_INPUT: usize = 131072;
pub const NETWORK: &str = "Test SDF Network ; September 2015";
pub const CONTRACT: &str = "CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON";
pub const ADMIN: &str = "GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F";
pub const SERVICE: &str = "GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX";
pub const COLLECTOR: &str = "GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V";
pub const RECYCLER: &str = "GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2";
type Result<T> = std::result::Result<T, &'static str>;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub network_passphrase: String,
    pub transaction_xdr: String,
    pub current_ledger: u32,
    pub signature_expiration_ledger: u32,
}
#[derive(Serialize)]
pub struct Response {
    pub status: &'static str,
    pub signers: Vec<String>,
    pub method: String,
}
#[derive(Serialize)]
pub struct SignedResponse {
    pub status: &'static str,
    pub signed_xdr: String,
    pub signers: Vec<String>,
    pub method: String,
}
pub struct Validated {
    pub tx: Transaction,
    pub method: String,
    pub source: &'static str,
    pub signers: Vec<&'static str>,
}
fn require(ok: bool, code: &'static str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(code)
    }
}
fn account(a: &AccountId) -> String {
    let PublicKey::PublicKeyTypeEd25519(Uint256(bytes)) = &a.0;
    format!("{}", stellar_strkey::ed25519::PublicKey(*bytes))
}
fn muxed(a: &MuxedAccount) -> Result<String> {
    match a {
        MuxedAccount::Ed25519(Uint256(bytes)) => {
            Ok(format!("{}", stellar_strkey::ed25519::PublicKey(*bytes)))
        }
        _ => Err("MuxedSourceNotAllowed"),
    }
}
fn symbol(a: &ScSymbol) -> Result<String> {
    String::from_utf8(a.0.to_vec()).map_err(|_| "InvalidSymbol")
}
fn address(a: &ScAddress) -> Result<String> {
    match a {
        ScAddress::Account(a) => Ok(account(a)),
        _ => Err("AccountAddressRequired"),
    }
}
fn byte32(v: &ScVal) -> bool {
    matches!(v,ScVal::Bytes(b) if b.0.len()==32 && b.0.iter().any(|b| *b!=0))
}
fn battery(v: &ScVal) -> bool {
    matches!(v,ScVal::String(b) if !b.0.is_empty() && b.0.len()<=32 && b.0.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c==b'-'))
}
fn evidence(v: &ScVal, id: &ScVal, request: &ScVal, kind: &str) -> Result<()> {
    let ScVal::Map(Some(map)) = v else {
        return Err("InvalidEvidence");
    };
    let keys = [
        "battery_id",
        "kind",
        "payload_hash",
        "request_id",
        "version",
    ];
    require(map.0.len() == 5, "InvalidEvidence")?;
    for (entry, key) in map.0.iter().zip(keys) {
        require(
            matches!(&entry.key,ScVal::Symbol(s) if symbol(s).ok().as_deref()==Some(key)),
            "InvalidEvidence",
        )?;
    }
    require(
        &map.0[0].val == id && &map.0[3].val == request,
        "EvidenceContextMismatch",
    )?;
    require(
        byte32(&map.0[2].val) && map.0[4].val == ScVal::U32(1),
        "InvalidEvidence",
    )?;
    let ScVal::Vec(Some(v)) = &map.0[1].val else {
        return Err("InvalidEvidence");
    };
    require(
        v.0.len() == 1
            && matches!(&v.0[0],ScVal::Symbol(s) if symbol(s).ok().as_deref()==Some(kind)),
        "InvalidEvidence",
    )
}
/// Complete validation precedes any potential signing; now is the local clock.
pub fn validate(request: &Request, now: u64) -> Result<Validated> {
    require(request.version == 1, "UnsupportedVersion")?;
    require(request.network_passphrase == NETWORK, "WrongNetwork")?;
    require(
        request.transaction_xdr.len() <= MAX_INPUT / 2,
        "XdrTooLarge",
    )?;
    require(
        request.current_ledger > 0
            && request.signature_expiration_ledger > request.current_ledger
            && request.signature_expiration_ledger - request.current_ledger <= 120,
        "InvalidExpirationLedger",
    )?;
    let env = TransactionEnvelope::from_xdr_base64(
        &request.transaction_xdr,
        Limits {
            depth: 64,
            len: 65536,
        },
    )
    .map_err(|_| "InvalidXdr")?;
    require(
        env.to_xdr_base64(Limits {
            depth: 64,
            len: 65536,
        })
        .map_err(|_| "InvalidXdr")?
            == request.transaction_xdr,
        "NonCanonicalXdr",
    )?;
    let TransactionEnvelope::Tx(env) = env else {
        return Err("EnvelopeNotAllowed");
    };
    require(env.signatures.is_empty(), "AlreadySignedEnvelope")?;
    let tx = env.tx;
    require(
        tx.seq_num.0 > 0 && tx.fee > 0 && tx.fee <= 50000000,
        "InvalidSequenceOrFee",
    )?;
    require(tx.memo == Memo::None, "MemoNotAllowed")?;
    let bounds = match &tx.cond {
        Preconditions::Time(t) => t,
        _ => return Err("TimeBoundsRequired"),
    };
    require(
        bounds.min_time.0 <= now && bounds.max_time.0 > now && bounds.max_time.0 <= now + 300,
        "InvalidTimeBounds",
    )?;
    require(
        matches!(&tx.ext, TransactionExt::V1(_)),
        "PreparedTransactionRequired",
    )?;
    require(tx.operations.len() == 1, "OperationCountNotAllowed")?;
    let op = &tx.operations[0];
    let OperationBody::InvokeHostFunction(body) = &op.body else {
        return Err("OperationNotAllowed");
    };
    let HostFunction::InvokeContract(call) = &body.host_function else {
        return Err("HostFunctionNotAllowed");
    };
    let ScAddress::Contract(ContractId(Hash(cid))) = &call.contract_address else {
        return Err("WrongContract");
    };
    require(
        stellar_strkey::Contract(*cid).to_string() == CONTRACT,
        "WrongContract",
    )?;
    let method = symbol(&call.function_name)?;
    let (source, signers, count) = match method.as_str() {
        "register_battery" => (ADMIN, vec![ADMIN], 2),
        "open_return" => (SERVICE, vec![SERVICE], 3),
        "cancel_return" => (SERVICE, vec![SERVICE], 2),
        "confirm_collection" => (SERVICE, vec![SERVICE, COLLECTOR], 4),
        "confirm_recycling" => (RECYCLER, vec![RECYCLER], 4),
        "pay_reward" => (SERVICE, vec![SERVICE], 1),
        _ => return Err("MethodNotAllowed"),
    };
    require(muxed(&tx.source_account)? == source, "WrongSource")?;
    if let Some(op_source) = &op.source_account {
        require(muxed(op_source)? == source, "WrongOperationSource")?;
    }
    let args = &call.args;
    require(args.len() == count && battery(&args[0]), "InvalidArguments")?;
    if count >= 2 {
        require(byte32(&args[1]), "InvalidHashArgument")?;
    }
    if method == "open_return" {
        require(
            matches!(&args[2], ScVal::Address(ScAddress::Account(_))),
            "InvalidRecipient",
        )?;
    }
    if method == "confirm_collection" || method == "confirm_recycling" {
        let expected = if method == "confirm_collection" {
            COLLECTOR
        } else {
            RECYCLER
        };
        require(
            matches!(&args[2],ScVal::Address(a) if address(a).ok().as_deref()==Some(expected)),
            "WrongActor",
        )?;
        evidence(
            &args[3],
            &args[0],
            &args[1],
            if method == "confirm_collection" {
                "Collection"
            } else {
                "Recycling"
            },
        )?;
    }
    require(body.auth.len() == signers.len(), "WrongAuthorizationCount")?;
    let mut seen = Vec::new();
    for auth in body.auth.iter() {
        let SorobanAuthorizedFunction::ContractFn(root) = &auth.root_invocation.function else {
            return Err("AuthFunctionNotAllowed");
        };
        require(
            root == call && auth.root_invocation.sub_invocations.is_empty(),
            "AuthInvocationMismatch",
        )?;
        let signer = match &auth.credentials {
            SorobanCredentials::SourceAccount => source.to_string(),
            SorobanCredentials::Address(c) | SorobanCredentials::AddressV2(c) => {
                require(
                    method == "confirm_collection"
                        && c.signature == ScVal::Void
                        && c.signature_expiration_ledger == 0,
                    "AuthCredentialsNotAllowed",
                )?;
                let a = address(&c.address)?;
                require(a == COLLECTOR, "WrongAuthSigner")?;
                a
            }
            _ => return Err("AuthCredentialsNotAllowed"),
        };
        require(
            signers.contains(&signer.as_str()) && !seen.contains(&signer),
            "WrongAuthSigner",
        )?;
        seen.push(signer);
    }
    Ok(Validated {
        tx,
        method,
        source,
        signers,
    })
}
pub fn validate_request(request: Request) -> Result<Response> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "ClockInvalid")?
        .as_secs();
    let v = validate(&request, now)?;
    Ok(Response {
        status: "validated",
        signers: v.signers.iter().map(|s| s.to_string()).collect(),
        method: v.method,
    })
}

fn secure_signer(public: &str) -> Result<soroban_cli::signer::Signer> {
    use soroban_cli::{
        print::Print,
        signer::{SecureStoreEntry, Signer, SignerKind},
    };
    let role = match public {
        ADMIN => "admin",
        SERVICE => "service",
        COLLECTOR => "collector",
        RECYCLER => "recycler",
        _ => return Err("SignerNotAllowed"),
    };
    // Fixed mapping from CLI v28 save_secret. No input can select an identity.
    let mut entry = SecureStoreEntry {
        name: format!("secure_store:org.stellar.cli-byetery-tn20260926-{role}"),
        hd_path: Some(0),
        public_key: None,
    };
    let actual = entry
        .get_public_key()
        .map_err(|_| "SecureStoreUnavailable")?;
    require(format!("{actual}") == public, "IdentityMismatch")?;
    // Official API verifies signatures against the key actually read through its API.
    entry.public_key = Some(actual);
    Ok(Signer {
        kind: SignerKind::SecureStore(entry),
        print: Print::new(true),
    })
}

/// Human explicitly authorized these four Testnet identities and this signing capability.
pub async fn sign_request(request: Request) -> Result<SignedResponse> {
    use soroban_cli::{
        config::network::Network, print::Print, signer::sign_soroban_authorizations,
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "ClockInvalid")?
        .as_secs();
    let validated = validate(&request, now)?;
    let mut signers = Vec::new();
    for public in &validated.signers {
        signers.push(secure_signer(public)?);
    }
    let tx = sign_soroban_authorizations(
        &validated.tx,
        &signers,
        request.signature_expiration_ledger,
        NETWORK,
        false,
        &Print::new(true),
    )
    .await
    .map_err(|_| "AuthorizationSigningFailed")?
    .unwrap_or(validated.tx);
    let source = signers
        .iter()
        .find(|s| {
            s.get_public_key().ok().map(|p| format!("{p}")).as_deref() == Some(validated.source)
        })
        .ok_or("SourceSignerMissing")?;
    // Network is only signing context. SecureStore's sign_tx never calls RPC.
    let network = Network {
        rpc_url: "https://soroban-testnet.stellar.org".into(),
        rpc_headers: vec![],
        network_passphrase: NETWORK.into(),
    };
    let signed = source
        .sign_tx(tx, &network)
        .await
        .map_err(|_| "EnvelopeSigningFailed")?;
    let encoded = signed
        .to_xdr_base64(Limits {
            depth: 64,
            len: 65536,
        })
        .map_err(|_| "OutputEncodingFailed")?;
    Ok(SignedResponse {
        status: "signed",
        signed_xdr: encoded,
        signers: validated.signers.iter().map(|s| s.to_string()).collect(),
        method: validated.method,
    })
}
