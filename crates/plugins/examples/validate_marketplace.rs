use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: validate_marketplace <marketplace.json-or-directory>");
        return ExitCode::from(2);
    };

    let marketplace = match codetwo_plugins::marketplace::load(Path::new(&path)) {
        Ok(marketplace) => marketplace,
        Err(error) => {
            eprintln!("invalid marketplace: {error}");
            return ExitCode::FAILURE;
        }
    };

    if !marketplace.diagnostics.is_empty() {
        for diagnostic in &marketplace.diagnostics {
            let entry = diagnostic
                .entry
                .map(|entry| format!(" entry {entry}"))
                .unwrap_or_default();
            eprintln!("{}{}: {}", diagnostic.code, entry, diagnostic.message);
        }
        return ExitCode::FAILURE;
    }

    println!(
        "{}: {} valid plugin entr{}",
        marketplace.display_name,
        marketplace.plugins.len(),
        if marketplace.plugins.len() == 1 {
            "y"
        } else {
            "ies"
        }
    );
    ExitCode::SUCCESS
}
