from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("check_sdlc.py")
SPEC = importlib.util.spec_from_file_location("check_sdlc", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
check_sdlc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = check_sdlc
SPEC.loader.exec_module(check_sdlc)


VALID_CHANGE = """\
---
id: change-2026-08-29-example
kind: change
status: executing
owner: repository maintainers
created: 2026-08-29
updated: 2026-08-29
next_trigger: verification runs
---

# Example

## Intent
Real problem and desired outcome.

## Spec
Observable behavior.

## Decision and gates
The owner accepted the intent.

## Plan
Implement and verify the smallest change.

## Build
Implementation is linked here.

## Verification
The actual result will be recorded before verified status.

## Review and release
No release is authorized.

## Feedback
No feedback recorded yet.
"""


class SdlcContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for relative in check_sdlc.REQUIRED_FILES:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# Contract\n", encoding="utf-8")
        self.change = self.root / "docs/sdlc/changes/2026-08-29-example.md"
        self.change.parent.mkdir(parents=True, exist_ok=True)
        self.change.write_text(VALID_CHANGE, encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_accepts_one_valid_canonical_source(self) -> None:
        self.assertEqual(check_sdlc.validate_repository(self.root), [])

    def test_rejects_legacy_superpowers_tree(self) -> None:
        legacy = self.root / "docs/superpowers/specs"
        legacy.mkdir(parents=True)
        errors = check_sdlc.validate_repository(self.root)
        self.assertTrue(any("legacy or parallel lifecycle path" in error for error in errors))

    def test_rejects_duplicate_artifact_ids(self) -> None:
        duplicate = self.root / "docs/sdlc/changes/2026-08-29-duplicate.md"
        duplicate.write_text(VALID_CHANGE, encoding="utf-8")
        errors = check_sdlc.validate_repository(self.root)
        self.assertTrue(any("duplicate artifact id" in error for error in errors))

    def test_rejects_missing_required_section(self) -> None:
        self.change.write_text(
            VALID_CHANGE.replace("## Feedback\nNo feedback recorded yet.\n", ""),
            encoding="utf-8",
        )
        errors = check_sdlc.validate_repository(self.root)
        self.assertTrue(any("missing required section ## Feedback" in error for error in errors))

    def test_verified_change_rejects_pending_verification_placeholder(self) -> None:
        self.change.write_text(
            VALID_CHANGE.replace("status: executing", "status: verified").replace(
                "The actual result will be recorded before verified status.", "Pending"
            ),
            encoding="utf-8",
        )
        errors = check_sdlc.validate_repository(self.root)
        self.assertTrue(any("cannot have pending verification" in error for error in errors))

    def test_release_gate_requires_named_ready_change(self) -> None:
        errors = check_sdlc.validate_repository(
            self.root, release_change="change-2026-08-29-example"
        )
        self.assertTrue(any("must be ready-to-release" in error for error in errors))

        self.change.write_text(
            VALID_CHANGE.replace("status: executing", "status: ready-to-release"),
            encoding="utf-8",
        )
        self.assertEqual(
            check_sdlc.validate_repository(
                self.root, release_change="change-2026-08-29-example"
            ),
            [],
        )

        errors = check_sdlc.validate_repository(self.root, release_change="change-missing")
        self.assertTrue(any("release change artifact not found" in error for error in errors))

    def test_branch_diff_requires_changed_change_artifact(self) -> None:
        self._git("init", "-q")
        self._git("config", "user.name", "SDLC Test")
        self._git("config", "user.email", "sdlc-test@example.invalid")
        self._git("add", ".")
        self._git("commit", "-qm", "baseline")
        base = self._git("rev-parse", "HEAD").stdout.strip()

        readme = self.root / "README.md"
        readme.write_text("material repository change\n", encoding="utf-8")
        self._git("add", "README.md")
        self._git("commit", "-qm", "change without artifact")
        errors = check_sdlc.validate_repository(self.root, base)
        self.assertTrue(any("require an added or updated canonical file" in error for error in errors))

        self.change.write_text(VALID_CHANGE + "\nFollow-up evidence.\n", encoding="utf-8")
        self._git("add", "docs/sdlc/changes/2026-08-29-example.md")
        self._git("commit", "-qm", "link canonical artifact")
        self.assertEqual(check_sdlc.validate_repository(self.root, base), [])

    def _git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
