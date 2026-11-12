use byetery_secure_store_signer::{sign_request, Request, MAX_INPUT};
use sha2::{Digest, Sha256};
use std::io::{self, BufRead, Read, Write};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let mut raw = Vec::new();
    let mut input = io::stdin().lock();
    let outcome = if (&mut input)
        .take(MAX_INPUT as u64 + 1)
        .read_until(b'\n', &mut raw)
        .is_err()
    {
        Err("InputReadFailed")
    } else if raw.len() > MAX_INPUT {
        Err("InputTooLarge")
    } else {
        if raw.last() == Some(&b'\n') {
            raw.pop();
        }
        let version = serde_json::from_slice::<serde_json::Value>(&raw)
            .ok()
            .and_then(|v| v.get("version").and_then(|v| v.as_u64()));
        let legacy_invalid = version != Some(3)
            && ((&mut input)
                .take((MAX_INPUT + 1 - raw.len()) as u64)
                .read_to_end(&mut raw)
                .is_err()
                || raw.len() > MAX_INPUT);
        if legacy_invalid {
            Err("InputTooLarge")
        } else if version == Some(3) {
            let request_hash =
                byetery_secure_store_signer::phased::hash_hex(Sha256::digest(&raw).into());
            let mut approve = |stage: &str| -> Result<(), &'static str> {
                println!(
                    "{}",
                    serde_json::json!({"version":3,"status":"key_ready","stage":stage,"requestHash":request_hash})
                );
                io::stdout().flush().map_err(|_| "ParentUnavailable")?;
                let mut permit = Vec::new();
                (&mut input)
                    .take(4097)
                    .read_until(b'\n', &mut permit)
                    .map_err(|_| "ParentUnavailable")?;
                if permit.len() > 4096 || permit.last() != Some(&b'\n') {
                    return Err("ParentUnavailable");
                }
                let value: serde_json::Value =
                    serde_json::from_slice(&permit).map_err(|_| "InvalidKeyPermit")?;
                if value.as_object().map(|o| o.len()) != Some(4)
                    || value["version"] != 3
                    || value["status"] != "key_permit"
                    || value["stage"] != stage
                    || value["requestHash"] != request_hash
                {
                    return Err("InvalidKeyPermit");
                }
                Ok(())
            };
            match serde_json::from_slice::<byetery_secure_store_signer::fenced::FencedRequest>(&raw)
            {
                Ok(request) => {
                    byetery_secure_store_signer::fenced::sign_fenced(request, &mut approve)
                        .and_then(|v| serde_json::to_value(v).map_err(|_| "OutputEncodingFailed"))
                }
                Err(_) => Err("InvalidRequest"),
            }
        } else if version == Some(2) {
            match serde_json::from_slice::<byetery_secure_store_signer::phased::PhasedRequest>(&raw)
            {
                Ok(request) => byetery_secure_store_signer::phased::sign_phase(request)
                    .await
                    .and_then(|v| serde_json::to_value(v).map_err(|_| "OutputEncodingFailed")),
                Err(_) => Err("InvalidRequest"),
            }
        } else {
            match serde_json::from_slice::<Request>(&raw) {
                Ok(request) => sign_request(request)
                    .await
                    .and_then(|v| serde_json::to_value(v).map_err(|_| "OutputEncodingFailed")),
                Err(_) => Err("InvalidRequest"),
            }
        }
    };
    match outcome {
        Ok(value) => println!("{}", serde_json::to_string(&value).unwrap()),
        Err(code) => {
            println!("{}", serde_json::json!({"status":"error","code":code}));
            std::process::exit(1);
        }
    }
}
