import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { GitDiffLineKind, GitFileDiff } from "../bridge";

const KIND_CLASS: Record<GitDiffLineKind, string> = {
  context: "",
  added: "add",
  removed: "del",
};

const KIND_MARKER: Record<GitDiffLineKind, string> = {
  context: " ",
  added: "+",
  removed: "-",
};

/**
 * GitHub-style review of a structured diff: one collapsible section per file, a sticky path with
 * `+N −M` statistics, and old/new line-number gutters. `DiffReview` only renders what the core
 * already bounded; an empty `files` list falls back to the caller's flat preview.
 */
export function DiffReview({
  files,
  notice,
}: {
  files: GitFileDiff[];
  notice?: ReactNode;
}) {
  return (
    <div className="diff-review">
      {notice}
      {files.map((file, fileIndex) => {
        const renamed =
          file.old_path != null &&
          file.old_path !== "" &&
          file.old_path !== file.path;
        return (
          <details key={`${file.path}-${fileIndex}`} className="diff-file" open>
            <summary className="diff-file-header">
              <span className="diff-file-path">{file.path}</span>
              {renamed ? (
                <span className="diff-file-old">from {file.old_path}</span>
              ) : null}
              <span className="diff-file-stats">
                <span className="diff-stat-add">+{file.additions}</span>
                <span className="diff-stat-del">-{file.deletions}</span>
              </span>
            </summary>
            {file.hunks.map((hunk, hunkIndex) => (
              <div key={`${file.path}-hunk-${hunkIndex}`}>
                <div className="diff-line hunk">
                  <span className="diff-gutter" />
                  <span className="diff-gutter" />
                  <span className="diff-line-text">
                    {`@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@`}
                  </span>
                </div>
                {hunk.lines.map((line, lineIndex) => (
                  <div
                    key={`${file.path}-${hunkIndex}-${lineIndex}`}
                    className={cn("diff-line", KIND_CLASS[line.kind])}
                  >
                    <span className="diff-gutter">{line.old_line ?? ""}</span>
                    <span className="diff-gutter">{line.new_line ?? ""}</span>
                    <span className="diff-line-text">
                      {KIND_MARKER[line.kind]}
                      {line.text || " "}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}
