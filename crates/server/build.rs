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

fn main() {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let root = manifest.join("assets/canvas");
    println!("cargo:rerun-if-changed={}", root.display());

    let mut paths = Vec::new();
    collect(&root, &root, &mut paths);
    paths.sort();

    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("out dir"));
    let mut generated = String::from("pub static CANVAS_ASSETS: &[(&str, &[u8])] = &[\n");
    for relative in paths {
        let relative = relative.to_string_lossy().replace('\\', "/");
        generated.push_str(&format!(
            "    ({relative:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/assets/canvas/{relative}\"))),\n"
        ));
    }
    generated.push_str("];\n");
    fs::write(out_dir.join("canvas_assets.rs"), generated).expect("write embedded canvas manifest");
}
