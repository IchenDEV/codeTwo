#[tokio::main]
async fn main() {
    if std::env::args().any(|argument| argument == "--codetwo-scene-mcp") {
        if let Err(error) = codetwo_desktop_host::run_scene_mcp() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    if let Err(error) = codetwo_desktop_host::run().await {
        eprintln!("C2 desktop host failed: {error}");
        std::process::exit(1);
    }
}
