use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: validate_bundle <bundle-directory>");
        return ExitCode::from(2);
    };

    let bundle =
        match codetwo_plugins::bundle::from_local(Path::new(&path), "Bundle validation", &path) {
            Ok(bundle) => bundle,
            Err(error) => {
                eprintln!("invalid bundle: {error}");
                return ExitCode::FAILURE;
            }
        };

    println!(
        "{} {}: {} validated contribution(s)",
        bundle.plugin.name,
        bundle.plugin.version,
        bundle.plugin.counts.total()
    );
    ExitCode::SUCCESS
}
