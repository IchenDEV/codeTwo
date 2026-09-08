# Linear issue development for CodeTwo

Connect Linear issues to isolated CodeTwo development tasks, validation receipts, pull requests,
review follow-up, and merge-based delivery comments. This bundle requires a CodeTwo build with the
`issues` connector capability and the desktop `issue-delivery` host feature, plus Node.js 18 or newer.
GitHub delivery requires an authenticated GitHub CLI and a `github.com` remote named `origin`.

## Install and connect

1. In **Features & plugins → Marketplace**, open this directory's `marketplace.json` and install
   **Linear**. Installation copies data only.
2. Enable and trust the installed bundle. Its plugin details show **Issue tracker connection**.
3. Enter a Linear personal API key. CodeTwo validates the workspace and saves the key in the system
   credential store (macOS Keychain, Windows Credential Store, or Linux Secret Service).
4. Open **Issue development**, search by title or paste a Linear issue URL/identifier, and choose
   the target repository and provider.

API keys never enter repository files, process arguments, task prompts, or delivery records.
The trusted adapter receives its credential only inside a host connector request. Disconnect removes
that connector's saved key; it does not delete development history.

## Develop an issue

Review the acceptance criteria, validation commands, and external-operation permissions before
starting. The base is the source checkout's current branch. To use another base, switch that
checkout before starting. CodeTwo creates a durable Core task and isolated worktree, then starts
its normal agent session under the repository's execution rules. Session questions and permission
requests are answered in that existing task.

Validation commands run in the task worktree after the agent commits its changes locally. Successful
receipts bind to the exact Git commit and a clean checkout. Pushes use that verified commit. With
permission, CodeTwo creates the linked PR and sends new review or failed-CI feedback into the same
session for correction. The controller never merges or deploys.

Only an observed merge of the bound PR completes delivery. Configure a completed state from the
issue's own team, or leave status unchanged and use Linear's existing GitHub automation. Closing a
PR without merging and cancelling development never mark the issue completed. PR merge does not
prove production deployment.

## Recovery and synchronization

- Repeated starts return the existing active issue/workspace/repository task. Starting again after
  completion requires an explicit new attempt.
- Existing tasks and PR associations survive app restarts. Interrupted creation has a **Retry task
  creation** action that first checks for an existing task/session and preserves the original base.
- Changed descriptions, comments, or attachments require review before further delivery. Continuing
  sends the accepted current context to the same task.
- Failed synchronization remains separate from development status. **Refresh / retry sync** retries
  with stable comment IDs so uncertain responses do not create duplicate comments.
- Disabling the bundle stops tracker access and synchronization while Core tasks remain available.
  Reconnect the same installed connector to resume sync.
- Monitoring runs while CodeTwo is open. There is no webhook receiver, remote queue, or cloud agent.
- On Unix, cancellation and timeouts stop validation process groups; on Windows the direct child is
  terminated and descendant cleanup is not guaranteed.

The plugin paginates issue context and rejects oversized contexts rather than silently omitting
requirements. Attachments and linked references are provided as metadata/URLs; authenticated binary
attachment download and document-content extraction are not included in this release.

## Validate the bundle

From the CodeTwo repository root:

```sh
node --test packs/linear/plugin.test.js
cargo run -p codetwo-plugins --example validate_bundle -- packs/linear
cd apps/desktop
bun run plugin:validate ../../packs/linear
```

Tests use fake GraphQL responses. No Linear account or external writes are needed.
