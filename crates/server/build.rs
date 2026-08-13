use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn collect(root: &Path, current: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(root, &path, out);
        } else if path.is_file() {
            out.push(
                path.strip_prefix(root)
                    .expect("asset under root")
                    .to_path_buf(),
            );
        }
    }
}

fn embed(manifest: &Path, out_dir: &Path, asset_dir: &str, static_name: &str, out_file: &str) {
    let root = manifest.join(asset_dir);
    println!("cargo:rerun-if-changed={}", root.display());

    let mut paths = Vec::new();
    collect(&root, &root, &mut paths);
    paths.sort();

    let mut generated = format!("pub static {static_name}: &[(&str, &[u8])] = &[\n");
    for relative in paths {
        let relative = relative.to_string_lossy().replace('\\', "/");
        generated.push_str(&format!(
            "    ({relative:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/{asset_dir}/{relative}\"))),\n"
        ));
    }
    generated.push_str("];\n");
    fs::write(out_dir.join(out_file), generated).expect("write embedded asset manifest");
}

fn main() {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("out dir"));
    embed(
        &manifest,
        &out_dir,
        "assets/canvas",
        "CANVAS_ASSETS",
        "canvas_assets.rs",
    );
    embed(
        &manifest,
        &out_dir,
        "assets/term",
        "TERM_ASSETS",
        "term_assets.rs",
    );
}
