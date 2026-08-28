import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Dock container and content seam", () => {
  test("keeps feature implementations out of the Dock container", () => {
    const dock = source("src/dock/Dock.tsx");

    expect(dock).toContain("content?: DockContentMap");
    expect(dock).toContain("{content[id]}");
    expect(dock).not.toContain("../browser/");
    expect(dock).not.toContain("../terminal/");
    expect(dock).not.toContain("../files/");
    expect(dock).not.toContain("../git/");
    expect(dock).not.toContain("../session/TrajectoryView");
    expect(dock).not.toContain("ptyDump");
    expect(dock).not.toContain("useDirtyPaths");
  });

  test("composes feature-owned content at the application shell", () => {
    const app = source("src/App.tsx");
    const terminal = source("src/terminal/TerminalDockContent.tsx");
    const files = source("src/files/FileDockContent.tsx");
    const git = source("src/git/GitDockContent.tsx");

    expect(app).toContain("content={{");
    expect(app).toContain("<TrajectoryView");
    expect(app).toContain("<BrowserPanel");
    expect(app).toContain("<TerminalDockContent");
    expect(app).toContain("<FileDockContent");
    expect(app).toContain("<GitDockContent");
    expect(terminal).toContain("ptyDump");
    expect(terminal).toContain("<TerminalPanel");
    expect(files).toContain("useDirtyPaths");
    expect(files).toContain("<FileViewer");
    expect(files).toContain("<FilePanel");
    expect(git).toContain("<GitHubPullRequestPanel");
  });
});
