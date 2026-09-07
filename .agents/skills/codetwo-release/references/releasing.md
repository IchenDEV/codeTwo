# Package and release CodeTwo

These are the repository's configured packaging paths. Consult actual workflow runs and release
assets for availability; this guide does not assert a successful build or publication.

## Nightly package

Every push to `main`, plus the daily 02:17 Asia/Singapore schedule, builds and verifies an Apple
Silicon DMG in the [Nightly macOS package](../../../../.github/workflows/nightly-macos.yml) workflow. Download
`C2-nightly-macos-arm64-<commit>` from that run's artifacts. Nightly packages are ad-hoc signed but
not Apple-notarized, so they are for testing rather than general distribution.

Development, nightly, and release builds can be installed together. Their macOS identities and
default data directories are isolated:

| Channel | Application | Bundle identifier | Application Support directory |
| --- | --- | --- | --- |
| Development | `C2-dev.app` | `dev.codetwo.app.dev` | `dev.codetwo.app.dev` |
| Nightly | `C2 Nightly.app` | `dev.codetwo.app.nightly` | `dev.codetwo.app.nightly` |
| Release | `C2.app` | `dev.codetwo.app` | `dev.codetwo.app` |

Only release builds embed the Sparkle update helper. Development and nightly builds stay on their
explicit build channel and cannot replace a release through the in-app updater.

## Versioned release

Run the [Release macOS](../../../../.github/workflows/release-macos.yml) workflow, enter a semantic version such
as `0.1.0`, provide a canonical change id with passing verification, a concrete release target,
explicit release approval, and rollback, and choose whether it is a prerelease. The
[workflow release Gate](../../codetwo-develop/references/workflow.md#review-and-release) owns these requirements;
implementation or local verification alone does not authorize dispatch. The workflow builds and
verifies the versioned Apple Silicon DMG before it creates the matching `v<version>` tag and publishes a GitHub Release with the DMG, SHA-256 checksum,
and authorized change id. Existing tags are never overwritten.

Release packages are currently ad-hoc signed and not Apple-notarized. They are suitable for testing
through GitHub Releases, but a public production distribution still requires Developer ID signing
and notarization.

## Verification and recovery

Before an authorized versioned dispatch, run:

```sh
bun script/verify/sdlc.ts --release-change <change-id>
```

The workflow verifies the DMG and records the change id alongside the package. After publication,
record the immutable tag/build, artifact identity, and observed smoke evidence in the change
record. Failed checks block advancement; follow the record's approved recovery path. Do not
overwrite an immutable release tag or infer release authority from a successful nightly.
