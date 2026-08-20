import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const source = (path: string) => readFileSync(resolve(desktop, "src", path), "utf8");

describe("built-in component policy integration", () => {
  test("projects voice, memory, scenes, and LSP policy into their real runtimes", () => {
    const app = source("App.tsx");
    const composer = source("session/Composer.tsx");
    const transcript = source("session/TranscriptPane.tsx");
    const pet = source("pet/CodeTwoPet.tsx");
    const lsp = source("lsp/client.ts");
    const lspAttachment = source("lsp/attach.ts");

    expect(app).toContain(
      "pluginManagerComponentEnabled(activePluginModel.components, id, activeComponentPolicyReady)",
    );
    expect(app).toContain('componentEnabled("voice.composer")');
    expect(app).toContain('componentEnabled("memory.settings")');
    expect(app).toContain('componentEnabled("scenes.surface")');
    expect(app).toContain('componentEnabled("lsp.runtime")');
    expect(app.match(/voiceEnabled=\{voiceComposerEnabled\}/g)).toHaveLength(2);
    expect(composer).toContain("{voiceEnabled ? (");
    expect(transcript).toContain("voiceEnabled={voiceEnabled}");
    expect(pet).toContain("{voiceEnabled ? <VoiceButton");

    expect(app.match(/componentEnabledRef\.current\("memory\.settings"\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(app.match(/componentEnabledRef\.current\("scenes\.surface"\)/g)?.length).toBeGreaterThanOrEqual(8);
    expect(app).toContain("memoryEnabled: memorySettingsEnabled");
    expect(app).toContain("scenesEnabled: scenesSurfaceEnabled");
    expect(app).toContain("void synchronizeLspRuntimePolicy(");
    expect(app).toContain("(enabled) => lspSetRuntimeEnabled(enabled, lspProjectPath)");
    expect(app).toContain('componentEnabledRef.current("lsp.runtime")');
    expect(app).toContain(
      "[activeComponentPolicyReady, lspPluginEnabled, lspProjectPath, lspRuntimeEnabled]",
    );
    expect(lsp).toContain("if (!runtimeEnabled) return null;");
    expect(lsp).toContain("for (const client of [...LspClient.clients.values()]) client.dispose()");
    expect(lsp).toContain("for (const listener of runtimeEnabledListeners) listener(workspace)");
    expect(lspAttachment).toContain("onLspRuntimeEnabled((workspace) => {");
    expect(lspAttachment).toContain("workspace === undefined || workspace === cwd");
    expect(lspAttachment).toContain("void attachLsp(cwd, model)");
  });

  test("sets the project command realm synchronously during startup selection", () => {
    const app = source("App.tsx");
    expect(app).toContain("setCallProjectPath(normalizePluginProjectPath(last.path))");
    expect(app).toContain("setCallProjectPath(normalizePluginProjectPath(resolved))");
  });
});
