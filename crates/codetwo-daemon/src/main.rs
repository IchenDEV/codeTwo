use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let path = match runtime_dir(std::env::args_os().skip(1).collect()) {
        Ok(path) => path,
        Err(message) => {
            eprintln!("codetwo-daemon: {message}");
            eprintln!("usage: codetwo-daemon [--runtime-dir PATH]");
            std::process::exit(2);
        }
    };
    let daemon = match codetwo_daemon::Daemon::bind(path) {
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

fn runtime_dir(args: Vec<std::ffi::OsString>) -> Result<PathBuf, String> {
    match args.as_slice() {
        [] => {
            let layout = codetwo_daemon::DataLayout::from_env();
            if std::env::var_os("CODETWO_DATA_DIR").is_none() {
                let decision = codetwo_daemon::inspect_legacy_data(&layout.data_dir)
                    .map_err(|error| format!("could not inspect legacy data: {error}"))?;
                match decision {
                    codetwo_daemon::LegacyDataDecision::CopyLegacyToCanonical { .. } => {
                        codetwo_daemon::copy_legacy_data(&decision)
                            .map_err(|error| format!("could not import legacy data: {error}"))?;
                    }
                    codetwo_daemon::LegacyDataDecision::LegacyAppearsNewer { .. } => {
                        eprintln!(
                            "codetwo-daemon: legacy ~/.codetwo data is newer; using the existing canonical data without merging"
                        );
                    }
                    codetwo_daemon::LegacyDataDecision::None
                    | codetwo_daemon::LegacyDataDecision::CanonicalAlreadyNewer { .. } => {}
                }
            }
            Ok(layout.data_dir)
        }
        [flag, path] if flag == "--runtime-dir" => Ok(PathBuf::from(path)),
        _ => Err("invalid arguments".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::runtime_dir;

    #[test]
    fn explicit_runtime_directory_remains_available_for_isolated_clients() {
        let path = std::env::temp_dir().join("codetwo-daemon-explicit-test");
        assert_eq!(
            runtime_dir(vec!["--runtime-dir".into(), path.clone().into_os_string()]).unwrap(),
            path
        );
        assert!(runtime_dir(vec!["--unknown".into()]).is_err());
    }
}
