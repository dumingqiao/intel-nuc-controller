fn main() {
    let package_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../package.json");
    println!("cargo:rerun-if-changed={}", package_path.display());
    let package_text =
        std::fs::read_to_string(&package_path).expect("failed to read the root package.json");
    let package: serde_json::Value =
        serde_json::from_str(&package_text).expect("failed to parse the root package.json");
    let release_version = package
        .get("version")
        .and_then(serde_json::Value::as_str)
        .expect("package.json must contain a SemVer version");
    let build_number = package
        .get("buildNumber")
        .and_then(serde_json::Value::as_u64)
        .expect("package.json must contain a numeric buildNumber");
    let cargo_version = env!("CARGO_PKG_VERSION");
    assert_eq!(
        release_version, cargo_version,
        "package.json version and src-tauri/Cargo.toml package version must match"
    );
    println!("cargo:rustc-env=NUC_BUILD_NUMBER={build_number}");
    println!("cargo:rustc-env=NUC_FULL_VERSION={release_version}+{build_number}");
    tauri_build::build()
}
