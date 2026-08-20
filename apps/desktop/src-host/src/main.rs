#[tokio::main]
async fn main() {
    if let Err(error) = codetwo_desktop_host::run().await {
        eprintln!("C2 desktop host failed: {error}");
        std::process::exit(1);
    }
}
