// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The bundler merges Info.plist only when it builds a `.app`; `tauri dev` runs this binary bare.
// This puts the same plist in the executable itself, which is where macOS looks for the usage
// strings when there's no bundle around it — without it, dictating aborts the process instead of
// asking for permission. Harmless in the bundled build, which carries the plist both ways.
#[cfg(target_os = "macos")]
embed_plist::embed_info_plist!("../Info.plist");

fn main() {
    codetwo_desktop_lib::run();
}
