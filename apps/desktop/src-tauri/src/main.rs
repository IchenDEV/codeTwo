// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|argument| argument == "--codetwo-browser-mcp") {
        if let Err(error) = codetwo_desktop_lib::run_browser_mcp() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    codetwo_desktop_lib::run();
}
