use std::{env, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=BYETERY_LLVM_LIB_DIR");
    if env::var("CARGO_CFG_TARGET_OS").as_deref()!=Ok("windows")
        || env::var("CARGO_CFG_TARGET_ENV").as_deref()!=Ok("gnu") { return; }
    // Only this standalone helper needs LLVM's C++ runtime via CLI/wasm-opt.
    // Link installed libraries; never patch dependencies or the global CLI.
    let root=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).parent().unwrap().parent().unwrap().to_path_buf();
    let lib=env::var_os("BYETERY_LLVM_LIB_DIR").map(PathBuf::from).unwrap_or_else(||
        root.join("contracts/byetery-contract/.tools/llvm-mingw-20260908-ucrt-x86_64/x86_64-w64-mingw32/lib"));
    for name in ["libc++.a","libc++abi.a","libunwind.a"] {
        assert!(lib.join(name).is_file(),"LLVM C++ runtime is not configured for helper build");
    }
    // Use absolute archives: adding this directory to -L would also replace
    // Rust GNU's own mingw CRT with LLVM/UCRT variants, mixing startup ABIs.
    for name in ["libc++.a", "libc++abi.a", "libunwind.a"] {
        println!("cargo:rustc-link-arg={}",lib.join(name).display());
    }
}
