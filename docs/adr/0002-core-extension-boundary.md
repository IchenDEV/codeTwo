# ADR 0002: Separate Core runtime modules from extensions

Status: Accepted

Date: 2026-08-26

## Context

C2 uses `codetwo_kernel::Plugin` to give Rust subsystems one lifecycle, dependency graph, command
registry, and cleanup model. That internal mechanism is useful, but the product also calls
installable bundles "plugins". Treating both meanings as one category made three boundaries
unclear:

- foundational services appeared user-disableable merely because they use the kernel lifecycle;
- compiled C2 features appeared equivalent to separately installed code;
- process extensions inherited every command in the Core registry as an accidental public API.

The accompanying [VS Code extension architecture research](../research/vscode-extension-architecture-2026-08-26.md)
shows the useful precedent: the workbench, extension host, stable `vscode` API, declarative
contributions, and Gallery are separate contracts. VS Code's extension host is a responsiveness and
fault boundary, not an OS security sandbox. C2 should preserve its stronger per-bundle/per-realm
process ownership without copying VSIX, Node, or VS Code's complete activation DSL.

## Decision

C2 uses these product terms:

| Term | Ownership | Installation and policy | Allowed dependency surface |
| --- | --- | --- | --- |
| **Core** | C2 or the host | Shipped with the host; never changed by extension policy | Private typed Rust services and internal commands |
| **Built-in feature** | C2 or the host | Shipped with C2; optional through product policy | May use private implementation APIs during migration |
| **Extension** | A separately installed bundle | Installed, trusted, enabled, updated, and removed independently | Only the versioned public Extension API |

`codetwo_kernel::Plugin` is therefore an internal **runtime-module** interface, not the C2 public
Extension API. Runtime metadata carries a `core`, `built_in`, or `extension` role so policy and UI
do not infer product ownership from the shared lifecycle mechanism.

Physical ownership follows the same distinction:

- `codetwo-core` contains product domain and execution behavior, with no dependency on the Kernel
  or plugin composition crate;
- `codetwo-kernel` contains the product-agnostic runtime-module lifecycle;
- `codetwo-plugins` is the composition root that depends on both, owns built-in adapters, Bundle
  installation and policy, the recovery/inspection surface, and extension process supervision.

Hosts may still compose a smaller graph explicitly; user or project extension policy cannot remove
a Core-role module from a graph the host chose to provide.

The existing `CoreApp::call` and realm-aware command path remains the one host-facing transport.
Commands are internal by default. A process extension receives and may call only commands that Core
explicitly marks extension-public; invocation is checked again at dispatch time. Public commands
must evolve as a versioned Extension API instead of inheriting every new internal command.

Installed bundles retain these properties:

- install is data-only;
- static contributions are inspectable before code runs;
- enablement and bundle trust make an extension eligible, while its child process activates on the
  first declared command invocation;
- each bundle and project realm owns a separate supervised process;
- UI is declarative and rendered by the host;
- process isolation does not claim an OS sandbox.

`c2-plugins` is the canonical community **catalog**, not a monorepo of plugin source. Each entry
points to an author-owned public repository and immutable revision. Inclusion means the entry passed
catalog and bundle validation; it is not a security, quality, or maintenance endorsement.

## Consequences

The Features & Plugins screen shows optional built-in/host features and installed extensions; Core
is available through diagnostics rather than a user toggle. Existing host adapters keep one
`CoreApp` graph and do not create a second plugin lifecycle.

Compiled built-in features are not yet equivalent to external extensions. Moving one out of Core is
complete only when it can use the public Extension API and bundle contract without private service
injection. The current `inject`/`optionalInject` manifest fields remain a migration surface and must
not be treated as stable access to Core services.

The initial catalog format is a preview control plane. Before it becomes an automatic default
update channel it still needs host compatibility selection, publisher/artifact identity, mandatory
digests or signatures, yanking/advisories, and last-known-good cache behavior.

## Rejected alternatives

**Expose every kernel command as the extension API.** This couples third-party code to private
implementation details and silently expands authority whenever Core adds a command.

**Create a second extension dispatch stack.** The existing command/event seam already provides the
right transport and realm behavior; it needs explicit visibility and policy, not a parallel bridge.

**Store community plugin source in the catalog repository.** Author-owned repositories preserve
release history and ownership. The catalog should review immutable metadata and supply-chain state.
