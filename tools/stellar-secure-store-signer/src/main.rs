use byetery_secure_store_signer::{sign_request, Request, MAX_INPUT};
use std::io::{self, Read};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let mut raw = Vec::new();
    let outcome = if io::stdin()
        .take(MAX_INPUT as u64 + 1)
        .read_to_end(&mut raw)
        .is_err()
    {
        Err("InputReadFailed")
    } else if raw.len() > MAX_INPUT {
        Err("InputTooLarge")
    } else {
        let version = serde_json::from_slice::<serde_json::Value>(&raw)
            .ok()
            .and_then(|v| v.get("version").and_then(|v| v.as_u64()));
        if version == Some(2) {
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
