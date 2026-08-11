use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let mut args = std::env::args_os().skip(1);
    let (Some(flag), Some(path), None) = (args.next(), args.next(), args.next()) else {
        eprintln!("usage: codetwo-daemon --runtime-dir PATH");
        std::process::exit(2);
    };
    if flag != "--runtime-dir" {
        eprintln!("usage: codetwo-daemon --runtime-dir PATH");
        std::process::exit(2);
    }
    let daemon = match codetwo_daemon::Daemon::bind(PathBuf::from(path)) {
        Ok(daemon) => daemon,
        Err(error) => {
            eprintln!("codetwo-daemon: {error}");
            std::process::exit(1);
        }
    };
    if let Err(error) = daemon.run().await {
        eprintln!("codetwo-daemon: {error}");
        std::process::exit(1);
    }
}
