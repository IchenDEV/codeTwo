// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { act as reactAct } from "react";
import { activateDom, button, dom, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { SettingsPage } = await import("../src/settings/SettingsPage");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Settings session import", () => {
  test("imports selected provider transcripts, refreshes the rail, and opens the result", async () => {
    let fallbackCwd = "";
    let refreshes = 0;
    let opened = "";
    const rendered = mount(
      <I18nProvider>
        <SettingsPage
          initialTab="import"
          bindings={[]}
          capturing={null}
          onCapture={() => {}}
          providers={[]}
          provider=""
          projectPath="/workspace"
          project={null}
          onProjectWorktreeMode={async () => {}}
          memoryEnabled={false}
          onClose={() => {}}
          sessionImporter={async (cwd) => {
            fallbackCwd = cwd;
            return {
              files: 2,
              imported: 1,
              skipped: 1,
              failed: 0,
              messages: 8,
              sessions: [{
                id: "import-codex-demo",
                title: "Imported conversation",
                source: "Codex",
                messages: 8,
                imported: true,
              }],
              errors: [],
            };
          }}
          onSessionsImported={() => {
            refreshes += 1;
          }}
          onOpenSession={(id) => {
            opened = id;
          }}
        />
      </I18nProvider>,
    );

    expect(rendered.container.textContent).toContain("Cursor, and T3 Code conversations");
    await reactAct(async () => button(rendered.container, "Choose files").click());
    await waitFor(() => expect(rendered.container.textContent).toContain("1 imported"));

    expect(fallbackCwd).toBe("/workspace");
    expect(refreshes).toBe(1);
    expect(rendered.container.textContent).toContain("8 visible messages added");
    await reactAct(async () => button(rendered.container, "Open session").click());
    expect(opened).toBe("import-codex-demo");
    rendered.unmount();
  });
});
