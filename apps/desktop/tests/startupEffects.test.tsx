import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { useCallback, useEffect, useRef } from "react";
import ts from "typescript";

import { useLatestRef, useStableCallback } from "../src/lib/useLatestRef";
import { activateDom, flush, mount } from "./domTestHarness";

// Run the actual App callbacks and their effects without Compiler memoization. State setters
// are inert so this regression can drive rerenders without reproducing the unbounded CPU loop.
function startupProbe() {
  const source = readFileSync(
    new URL("../src/App.tsx", import.meta.url),
    "utf8"
  );
  const ast = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const app = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "App"
  ) as ts.FunctionDeclaration;
  const names = [
    "refreshProviders",
    "refreshSkills",
    "refreshQuickQuota",
    "refreshGit",
    "refreshScenes",
  ];
  const statements = app.body!.statements.filter((node) => {
    if (ts.isVariableStatement(node))
      return node.declarationList.declarations.some((declaration) =>
        names.includes(declaration.name.getText(ast))
      );
    if (
      !ts.isExpressionStatement(node) ||
      !ts.isCallExpression(node.expression) ||
      node.expression.expression.getText(ast) !== "useEffect"
    )
      return false;
    const callback = node.expression.arguments[0]?.getText(ast) ?? "";
    return names.some((name) => callback.includes(`${name}()`));
  });
  expect(statements).toHaveLength(10);
  const implementation = ts.transpileModule(
    statements
      .map((node) => node.getText(ast))
      .join("\n")
      .replaceAll("import.meta.env.DEV", "false"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
    }
  ).outputText;
  const counts: Record<string, number> = {};
  const requests = new Proxy(
    {},
    {
      get: (_target, name: string) => async () => {
        counts[name] = (counts[name] ?? 0) + 1;
        return name === "gitStatus" ? { is_repo: false, files: [] } : [];
      },
    }
  );
  const make = new Function(
    "useCallback",
    "useStableCallback",
    "useEffect",
    "useRef",
    "requests",
    `
    const {listProviders,listSkills,providerQuota,gitStatus,gitSourceControlInfo,listScenes,listPipelines}=requests;
    const noop=()=>{}; const refreshCheckpoints=noop,activeSession=null,showSourceControl=false;
    const setProvidersStatus=noop,setProviders=noop,setProvider=noop,setSkills=noop,setQuickQuotaLoading=noop,setQuickQuotaReport=noop,setGitWorkspace=noop,setScenes=noop,setPipelines=noop;
    const loadProviderRegistry=(load)=>load();
    const EMPTY_GIT_WORKSPACE={}; const EMPTY_DIFF_STAT={};
    return function StartupProbe({cwd,quickQuotaProvider,scenesSurfaceEnabled}) {
      const providerRegistryRequestRef=useRef(0),providerPinned=useRef(false),quickQuotaRequestRef=useRef(0),gitRefreshSeq=useRef(0),cwdRef=useRef(cwd),scenesRef=useRef([]),componentEnabledRef=useRef(()=>true);
      cwdRef.current=cwd;
      ${implementation}
      return null;
    };
  `
  );
  return {
    Component: make(
      useCallback,
      useStableCallback,
      useEffect,
      useRef,
      requests
    ),
    counts,
  };
}

test("startup reads do not repeat on unrelated renders, but follow workspace and provider changes", async () => {
  activateDom();
  const { Component, counts } = startupProbe();
  const render = (cwd = "/one", quickQuotaProvider = "codex") => (
    <Component
      cwd={cwd}
      quickQuotaProvider={quickQuotaProvider}
      scenesSurfaceEnabled
    />
  );
  const mounted = mount(render());
  try {
    await flush();
    const initial = { ...counts };
    expect(initial.listProviders).toBe(1);
    for (let i = 0; i < 10; i++) mounted.rerender(render());
    await flush();
    expect(counts).toEqual(initial);
    mounted.rerender(render("/two"));
    await flush();
    expect(counts.listSkills).toBe(initial.listSkills! + 1);
    expect(counts.gitStatus).toBe(initial.gitStatus! + 1);
    expect(counts.listScenes).toBe(initial.listScenes! + 1);
    expect(counts.listProviders).toBe(1);
    mounted.rerender(render("/two", "claude"));
    await flush();
    expect(counts.providerQuota).toBe(initial.providerQuota! + 1);
  } finally {
    mounted.unmount();
  }
});

function coreSubscriptionProbe(
  subscribe: (handler: unknown) => Promise<() => void>
) {
  const source = readFileSync(
    new URL("../src/App.tsx", import.meta.url),
    "utf8"
  );
  const ast = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const app = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "App"
  ) as ts.FunctionDeclaration;
  const reference = app.body!.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (item) => item.name.getText(ast) === "coreEventCallbacks"
      )
  ) as ts.VariableStatement;
  const effect = app.body!.statements.find(
    (node) =>
      ts.isExpressionStatement(node) &&
      node.getText(ast).includes("await onEngineEvent(")
  )!;
  const call = reference.declarationList.declarations[0]!
    .initializer as ts.CallExpression;
  const callbacks = (call.arguments[0] as ts.ObjectLiteralExpression).properties
    .map((node) => node.name!.getText(ast))
    .filter((name) => name !== "refreshSessions");
  const implementation = ts.transpileModule(
    reference.getText(ast) + "\n" + effect.getText(ast),
    { compilerOptions: { target: ts.ScriptTarget.ESNext } }
  ).outputText;
  const make = new Function(
    "useEffect",
    "useLatestRef",
    "onEngineEvent",
    `
    const refreshSessions=()=>{};
    return function CoreSubscriptionProbe() {
      ${callbacks.map((name) => `const ${name}=()=>{};`).join("\n")}
      ${implementation}
      return null;
    };
  `
  );
  return make(useEffect, useLatestRef, subscribe);
}

test("Core subscribes once across rerenders and disposes a subscription that resolves after unmount", async () => {
  activateDom();
  let subscriptions = 0;
  let disposals = 0;
  let finish: ((dispose: () => void) => void) | undefined;
  const Component = coreSubscriptionProbe(() => {
    subscriptions++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const mounted = mount(<Component />);
  try {
    for (let i = 0; i < 10; i++) mounted.rerender(<Component />);
    expect(subscriptions).toBe(1);
  } finally {
    mounted.unmount();
  }
  finish!(() => {
    disposals++;
  });
  await flush();
  expect(disposals).toBe(1);
});

test("a retained event callback reads the latest render without replacing its subscription identity", () => {
  activateDom();
  let callback: (() => number) | undefined;
  function Component({ version }: { version: number }) {
    callback = useStableCallback(() => version);
    return null;
  }
  const mounted = mount(<Component version={1} />);
  try {
    const original = callback!;
    expect(original()).toBe(1);
    mounted.rerender(<Component version={2} />);
    expect(callback).toBe(original);
    expect(original()).toBe(2);
  } finally {
    mounted.unmount();
  }
});
