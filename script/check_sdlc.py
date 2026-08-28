#!/usr/bin/env python3
"""Validate CodeTwo's canonical SDLC artifacts with only the Python standard library."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


REQUIRED_FILES = (
    "docs/sdlc/workflow.md",
    "docs/sdlc/templates/change.md",
    "docs/sdlc/templates/incident.md",
    "docs/sdlc/templates/eval.md",
)

LEGACY_PATHS = (
    "docs/superpowers",
    "docs/sdlc/specs",
    "docs/sdlc/plans",
)

ARTIFACT_KINDS = {
    "changes": "change",
    "incidents": "incident",
    "evals": "eval",
}

ALLOWED_STATUSES = {
    "change": {
        "draft",
        "in-review",
        "accepted",
        "executing",
        "blocked",
        "failed",
        "verified",
        "ready-to-release",
        "released",
        "closed",
        "superseded",
    },
    "incident": {
        "investigating",
        "mitigated",
        "blocked",
        "resolved",
        "closed",
        "superseded",
    },
    "eval": {"draft", "active", "blocked", "retired"},
}

REQUIRED_SECTIONS = {
    "change": (
        "intent",
        "spec",
        "decision and gates",
        "plan",
        "build",
        "verification",
        "review and release",
        "feedback",
    ),
    "incident": (
        "detection and impact",
        "timeline",
        "diagnosis",
        "mitigation and recovery",
        "follow-ups",
        "regression eval",
    ),
    "eval": (
        "provenance",
        "fixed input and environment",
        "allowed actions",
        "observable acceptance",
        "scoring and failure classes",
        "last result",
    ),
}

REQUIRED_FIELDS = (
    "id",
    "kind",
    "status",
    "owner",
    "created",
    "updated",
    "next_trigger",
)

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{5,95}$")
HEADING_RE = re.compile(r"^##\s+(.+?)\s*$")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
UNASSIGNED = {"", "unassigned", "tbd", "todo", "<owner>"}


@dataclass(frozen=True)
class Artifact:
    path: Path
    metadata: dict[str, str]
    sections: dict[str, str]


def _normalize_heading(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def parse_artifact(path: Path) -> tuple[Artifact | None, list[str]]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    relative = path.as_posix()

    if not lines or lines[0].strip() != "---":
        return None, [f"{relative}: missing opening YAML frontmatter delimiter"]

    try:
        closing = next(index for index, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration:
        return None, [f"{relative}: missing closing YAML frontmatter delimiter"]

    metadata: dict[str, str] = {}
    for number, line in enumerate(lines[1:closing], 2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([a-z_]+):\s*(.*)", line)
        if not match:
            errors.append(
                f"{relative}:{number}: frontmatter must use flat scalar key: value fields"
            )
            continue
        key, raw_value = match.groups()
        if key in metadata:
            errors.append(f"{relative}:{number}: duplicate frontmatter field {key}")
            continue
        metadata[key] = _unquote(raw_value.strip())

    body_lines = lines[closing + 1 :]
    sections: dict[str, str] = {}
    current: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        if current is not None:
            sections[current] = "\n".join(buffer).strip()
        buffer = []

    for line in body_lines:
        match = HEADING_RE.match(line)
        if match:
            flush()
            current = _normalize_heading(match.group(1))
        elif current is not None:
            buffer.append(line)
    flush()

    return Artifact(path=path, metadata=metadata, sections=sections), errors


def _validate_local_links(root: Path, path: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    for target in LINK_RE.findall(text):
        clean = target.strip().strip("<>")
        if not clean or clean.startswith(("#", "https://", "http://", "mailto:")):
            continue
        clean = clean.split("#", 1)[0]
        resolved = (path.parent / clean).resolve()
        try:
            resolved.relative_to(root.resolve())
        except ValueError:
            errors.append(f"{path.as_posix()}: local link escapes repository: {target}")
            continue
        if not resolved.exists():
            errors.append(f"{path.as_posix()}: broken local link: {target}")
    return errors


def validate_artifact(root: Path, artifact: Artifact, expected_kind: str) -> list[str]:
    errors: list[str] = []
    relative = artifact.path.relative_to(root).as_posix()
    metadata = artifact.metadata

    for field in REQUIRED_FIELDS:
        if not metadata.get(field, "").strip():
            errors.append(f"{relative}: missing required frontmatter field {field}")

    kind = metadata.get("kind")
    if kind and kind != expected_kind:
        errors.append(f"{relative}: kind must be {expected_kind}, found {kind}")

    artifact_id = metadata.get("id", "")
    if artifact_id and not ID_RE.fullmatch(artifact_id):
        errors.append(f"{relative}: invalid id {artifact_id!r}")
    expected_id = f"{expected_kind}-{artifact.path.stem}"
    if artifact_id and artifact_id != expected_id:
        errors.append(f"{relative}: id must match filename: expected {expected_id}")

    status = metadata.get("status", "")
    if status and status not in ALLOWED_STATUSES[expected_kind]:
        allowed = ", ".join(sorted(ALLOWED_STATUSES[expected_kind]))
        errors.append(f"{relative}: invalid {expected_kind} status {status!r}; allowed: {allowed}")

    for field in ("created", "updated"):
        value = metadata.get(field, "")
        if value:
            try:
                dt.date.fromisoformat(value)
            except ValueError:
                errors.append(f"{relative}: {field} must be YYYY-MM-DD, found {value!r}")

    if metadata.get("created") and metadata.get("updated"):
        if metadata["updated"] < metadata["created"]:
            errors.append(f"{relative}: updated date precedes created date")

    if status not in {"", "draft", "in-review", "investigating"}:
        if metadata.get("owner", "").strip().lower() in UNASSIGNED:
            errors.append(f"{relative}: status {status} requires an assigned owner")

    for heading in REQUIRED_SECTIONS[expected_kind]:
        if heading not in artifact.sections:
            errors.append(f"{relative}: missing required section ## {heading.title()}")
        elif not artifact.sections[heading].strip():
            errors.append(f"{relative}: section ## {heading.title()} is empty")

    if expected_kind == "change" and status in {
        "verified",
        "ready-to-release",
        "released",
        "closed",
    }:
        verification = artifact.sections.get("verification", "").lower()
        if re.search(r"(?m)^\s*(pending|todo)(?:\s|$)", verification):
            errors.append(f"{relative}: status {status} cannot have pending verification")

    errors.extend(_validate_local_links(root, artifact.path))
    return errors


def _changed_paths(root: Path, base: str) -> tuple[list[tuple[str, tuple[str, ...]]], list[str]]:
    result = subprocess.run(
        ["git", "diff", "--name-status", "--find-renames", f"{base}...HEAD"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "git diff failed"
        return [], [f"cannot compare SDLC branch with base {base}: {detail}"]

    changes: list[tuple[str, tuple[str, ...]]] = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        changes.append((parts[0], tuple(parts[1:])))
    return changes, []


def _validate_changed_artifact_gate(root: Path, base: str) -> list[str]:
    changes, errors = _changed_paths(root, base)
    if errors or not changes:
        return errors

    material_paths = {path for _, paths in changes for path in paths}
    changed_change_artifacts = {
        path
        for status, paths in changes
        if not status.startswith("D")
        for path in paths
        if path.startswith("docs/sdlc/changes/") and path.endswith(".md")
    }

    if material_paths and not changed_change_artifacts:
        return [
            "material branch changes require an added or updated canonical file under "
            "docs/sdlc/changes/"
        ]
    return []


def _validate_release_gate(artifacts: dict[str, Artifact], change_id: str) -> list[str]:
    artifact = artifacts.get(change_id)
    if artifact is None:
        return [f"release change artifact not found: {change_id}"]
    if artifact.metadata.get("kind") != "change":
        return [f"release artifact must be a change: {change_id}"]
    status = artifact.metadata.get("status")
    if status != "ready-to-release":
        return [
            f"release change {change_id} must be ready-to-release, found {status or 'missing'}"
        ]
    return []


def validate_repository(
    root: Path,
    base: str | None = None,
    release_change: str | None = None,
) -> list[str]:
    root = root.resolve()
    errors: list[str] = []

    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"missing required SDLC file: {relative}")

    for relative in LEGACY_PATHS:
        if (root / relative).exists():
            errors.append(f"legacy or parallel lifecycle path is forbidden: {relative}")

    seen_ids: dict[str, str] = {}
    artifacts: dict[str, Artifact] = {}
    change_count = 0
    for directory, expected_kind in ARTIFACT_KINDS.items():
        artifact_root = root / "docs" / "sdlc" / directory
        if not artifact_root.exists():
            continue
        for path in sorted(artifact_root.rglob("*.md")):
            artifact, parse_errors = parse_artifact(path)
            errors.extend(parse_errors)
            if artifact is None:
                continue
            errors.extend(validate_artifact(root, artifact, expected_kind))
            artifact_id = artifact.metadata.get("id")
            relative = path.relative_to(root).as_posix()
            if artifact_id:
                if artifact_id in seen_ids:
                    errors.append(
                        f"duplicate artifact id {artifact_id!r}: {seen_ids[artifact_id]} and {relative}"
                    )
                else:
                    seen_ids[artifact_id] = relative
                    artifacts[artifact_id] = artifact
            if expected_kind == "change":
                change_count += 1

    if change_count == 0:
        errors.append("at least one canonical change artifact is required")

    workflow = root / "docs" / "sdlc" / "workflow.md"
    if workflow.is_file():
        errors.extend(_validate_local_links(root, workflow))

    if base:
        errors.extend(_validate_changed_artifact_gate(root, base))
    if release_change:
        errors.extend(_validate_release_gate(artifacts, release_change))

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root (defaults to the parent of script/)",
    )
    parser.add_argument(
        "--base",
        help="optional Git base commit; require a changed canonical artifact for branch changes",
    )
    parser.add_argument(
        "--release-change",
        help="require this change Artifact to be in ready-to-release state",
    )
    args = parser.parse_args(argv)

    errors = validate_repository(args.root, args.base, args.release_change)
    if errors:
        for error in errors:
            print(f"[sdlc] error: {error}", file=sys.stderr)
        print(f"[sdlc] failed with {len(errors)} error(s)", file=sys.stderr)
        return 1

    print("[sdlc] contract valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
