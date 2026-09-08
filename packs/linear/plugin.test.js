const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { join } = require('node:path');
const { createInterface } = require('node:readline');
const { test } = require('node:test');
const { createAdapter, issueIdentifier, commentId } = require('./plugin');
const manifest = require('./plugin.json');

const TOKEN = 'lin_api_test_only_never_a_real_credential';
const ISSUE_ID = '12345678-1234-4234-8234-123456789abc';
const issue = {
  id: ISSUE_ID, identifier: 'APP-7', title: 'Add feature', url: 'https://linear.app/example/issue/APP-7/add-feature',
  description: 'Acceptance conditions', updatedAt: '2026-09-08T00:00:00Z', priority: 2,
  team: { id: 'team-1', name: 'App', key: 'APP' }, state: { id: 'state-1', name: 'Todo', type: 'unstarted' },
  assignee: { id: 'user-1', name: 'Test User' },
};
const page = (nodes, hasNextPage = false, endCursor = null) => ({ nodes, pageInfo: { hasNextPage, endCursor } });
const result = (data) => new Response(JSON.stringify({ data }));
function fakeAdapter(handler) {
  const calls = [];
  const invoke = createAdapter(async (url, options) => {
    assert.equal(url, 'https://api.linear.app/graphql');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, TOKEN);
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!options.body.includes(TOKEN), 'credentials stay outside GraphQL data');
    const request = JSON.parse(options.body);
    calls.push(request);
    return handler(request, calls);
  });
  return { calls, invoke: (operation, input = {}) => invoke(operation, { ...input, _credential: TOKEN }) };
}
const syncInput = { id: 'APP-7', workspace_id: 'workspace-1', body: 'Verified delivery', key: 'task-1:merged' };
function identity() { return { organization: { id: 'workspace-1' }, issue: { id: ISSUE_ID, team: { id: 'team-1' } } }; }

test('creates stable comment IDs compatible with Linear UUID v4 input', () => {
  const id = commentId('workspace-1:issue-1:task-1:merged');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(commentId('workspace-1:issue-1:task-1:merged'), id);
  assert.notEqual(commentId('workspace-1:issue-1:task-2:merged'), id);
});

test('validates issue links before any API call', async () => {
  assert.equal(issueIdentifier(issue.url), 'APP-7');
  assert.equal(issueIdentifier(' APP-7 '), 'APP-7');
  const { invoke, calls } = fakeAdapter(() => { throw new Error('must not fetch'); });
  for (const id of ['https://evil.test/issue/APP-7', 'http://linear.app/a/issue/APP-7', 'https://linear.app.evil.test/issue/APP-7', 'APP-7\nquery Evil {}']) {
    await assert.rejects(invoke('issues.get', { id }));
  }
  assert.equal(calls.length, 0);
});

test('loads connection identity and team workflow states', async () => {
  const teams = [{ id: 'team-1', key: 'APP', name: 'App', states: page([{ id: 'done-1', name: 'Done', type: 'completed' }]) }];
  const { invoke } = fakeAdapter(({ query }) => {
    assert.match(query, /states\s*\{\s*nodes/);
    return result({ viewer: { id: 'user-1', name: 'Test User' }, organization: { id: 'workspace-1', name: 'Workspace' }, teams: page(teams, true) });
  });
  const connection = await invoke('connection.info');
  assert.equal(connection.workspace.id, 'workspace-1');
  assert.deepEqual(connection.teams, teams);
  assert.equal(connection.teams_more, true);
});

test('filters issues using GraphQL variables and follows result cursors', async () => {
  const search = 'quote" and query { unexpected }';
  const { invoke, calls } = fakeAdapter(({ query, variables }) => {
    assert.ok(!query.includes(search));
    assert.deepEqual(variables.filter, { team: { id: { eq: 'team-1' } }, assignee: { id: { eq: 'user-1' } }, title: { containsIgnoreCase: search } });
    return result({ organization: { id: 'workspace-1' }, issues: page([issue], !variables.after, 'next-page') });
  });
  const filters = { team_id: 'team-1', assignee_id: 'user-1', query: search };
  const first = await invoke('issues.list', filters);
  assert.equal(first.cursor, 'next-page');
  assert.equal(first.items[0].workspace_id, 'workspace-1');
  const last = await invoke('issues.list', { ...filters, cursor: first.cursor });
  assert.equal(calls[1].variables.after, 'next-page');
  assert.equal(last.cursor, null);
});

test('loads issue context including comments, attachments and family', async () => {
  const comments = [{ id: 'comment-1', body: 'More acceptance criteria', updatedAt: issue.updatedAt, user: issue.assignee }];
  const attachments = [{ id: 'attachment-1', title: 'Design', url: 'https://example.test/design' }];
  const parent = { id: 'parent-1', identifier: 'APP-1', title: 'Parent', url: 'https://linear.app/example/issue/APP-1' };
  const { invoke } = fakeAdapter(({ query, variables }) => {
    assert.equal(variables.id, 'APP-7');
    assert.match(query, /comments\(/);
    assert.match(query, /attachments\(/);
    return result({ organization: { id: 'workspace-1' }, issue: { ...issue, comments: page(comments), attachments: page(attachments), parent, children: page([]) } });
  });
  const detail = await invoke('issues.get', { id: issue.url });
  assert.deepEqual(detail.comments, comments);
  assert.deepEqual(detail.attachments, attachments);
  assert.deepEqual(detail.parent, parent);
  assert.equal(detail.description, 'Acceptance conditions');
});

test('exposes and consumes cursors for comments and attachments beyond the detail page', async () => {
  const { invoke } = fakeAdapter(({ query, variables }) => {
    if (query.includes('query Issue(')) return result({ organization: { id: 'workspace-1' }, issue: { ...issue,
      comments: page([], true, 'comments-next'), attachments: page([], true, 'attachments-next') } });
    assert.match(query, /after:\$after/);
    const field = query.includes('comments(') ? 'comments' : 'attachments';
    assert.equal(variables.after, `${field}-next`);
    return result({ issue: { [field]: page([{ id: `${field}-last` }]) } });
  });
  const detail = await invoke('issues.get', { id: 'APP-7' });
  for (const field of ['comments', 'attachments']) {
    assert.equal(detail[`${field}_cursor`], `${field}-next`);
    const remaining = await invoke(`issues.${field}`, { id: 'APP-7', cursor: detail[`${field}_cursor`] });
    assert.deepEqual(remaining.items, [{ id: `${field}-last` }]);
    assert.equal(remaining.cursor, null);
  }
});

test('sanitizes HTTP, GraphQL, network and response-stream failures', async () => {
  const responses = [
    () => new Response(TOKEN, { status: 401 }),
    () => new Response(JSON.stringify({ errors: [{ message: TOKEN }] })),
    () => { throw new Error(TOKEN); },
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(TOKEN)); } })),
  ];
  for (const response of responses) {
    const { invoke } = fakeAdapter(response);
    await assert.rejects(invoke('connection.info'), (error) => {
      assert.ok(!error.message.includes(TOKEN), 'credential must never escape in errors');
      return true;
    });
  }
});

test('rejects oversized and malformed responses', async () => {
  for (const response of [() => new Response('x'.repeat(750_001)), () => new Response('{invalid')]) {
    const { invoke } = fakeAdapter(response);
    await assert.rejects(invoke('connection.info'), /response|large/i);
  }
});

test('retries an ambiguous comment create without posting a second comment', async () => {
  let posted = null;
  let creates = 0;
  let commentReads = 0;
  const { invoke } = fakeAdapter(({ query, variables }) => {
    if (query.includes('query Identity')) return result(identity());
    if (query.includes('query Comments')) {
      commentReads++;
      return result({ issue: { comments: page(posted ? [posted] : []) } });
    }
    assert.match(query, /mutation Comment/);
    creates++;
    posted = { id: variables.input.id, url: 'https://linear.app/comment/created' };
    throw new Error('Lost response after successful create');
  });
  await assert.rejects(invoke('issues.sync', syncInput), /failed|timed out/);
  const retry = await invoke('issues.sync', syncInput);
  assert.equal(retry.comment_url, posted.url);
  assert.equal(creates, 1);
  assert.equal(commentReads, 2);
});

test('uses the canonical issue UUID to deduplicate identifier and UUID retries', async () => {
  const posted = [];
  const { invoke } = fakeAdapter(({ query, variables }) => {
    if (query.includes('query Identity')) return result(identity());
    if (query.includes('query Comments')) return result({ issue: { comments: page(posted) } });
    assert.match(query, /mutation Comment/);
    const comment = { id: variables.input.id, url: `https://linear.app/comment/${posted.length}` };
    posted.push(comment);
    return result({ commentCreate: { success: true, comment } });
  });
  const first = await invoke('issues.sync', syncInput);
  const retry = await invoke('issues.sync', { ...syncInput, id: ISSUE_ID });
  assert.equal(retry.comment_url, first.comment_url);
  assert.equal(posted.length, 1);
});

test('scans comment pagination and does not write if existing history cannot be verified', async () => {
  const { invoke, calls } = fakeAdapter(({ query, variables }, requests) => {
    if (query.includes('query Identity')) return result(identity());
    assert.match(query, /query Comments/);
    if (requests.length > 2) assert.equal(variables.after, `cursor-${requests.length - 1}`);
    return result({ issue: { comments: page([], true, `cursor-${requests.length}`) } });
  });
  await assert.rejects(invoke('issues.sync', syncInput), /verify|duplicate/);
  assert.equal(calls.filter(({ query }) => query.includes('query Comments')).length, 20);
  assert.ok(calls.every(({ query }) => !query.includes('mutation')));
});

test('refuses cross-workspace writes and cross-team state updates', async () => {
  const crossWorkspace = fakeAdapter(() => result({ ...identity(), organization: { id: 'other-workspace' } }));
  await assert.rejects(crossWorkspace.invoke('issues.sync', syncInput), /different workspace/);
  assert.equal(crossWorkspace.calls.length, 1);
  const { invoke, calls } = fakeAdapter(({ query, variables }) => {
    if (query.includes('query Identity')) return result(identity());
    if (query.includes('query Comments')) return result({ issue: { comments: page([]) } });
    if (query.includes('mutation Comment')) return result({ commentCreate: { success: true, comment: { id: variables.input.id, url: 'https://linear.app/comment/1' } } });
    assert.match(query, /query State/);
    return result({ workflowState: { id: 'other-state', type: 'completed', team: { id: 'other-team' } } });
  });
  await assert.rejects(invoke('issues.sync', { ...syncInput, state_id: 'other-state' }), /another team/);
  assert.ok(calls.every(({ query }) => !query.includes('mutation StateUpdate')));
});

test('updates only a verified state in the issue team after confirming the comment', async () => {
  const { invoke, calls } = fakeAdapter(({ query, variables }) => {
    if (query.includes('query Identity')) return result(identity());
    if (query.includes('query Comments')) return result({ issue: { comments: page([]) } });
    if (query.includes('mutation Comment')) return result({ commentCreate: { success: true, comment: { id: variables.input.id, url: 'https://linear.app/comment/1' } } });
    if (query.includes('query State')) return result({ workflowState: { id: 'done-1', type: 'completed', team: { id: 'team-1' } } });
    assert.match(query, /mutation StateUpdate/);
    assert.deepEqual(variables, { id: ISSUE_ID, input: { stateId: 'done-1' } });
    return result({ issueUpdate: { success: true } });
  });
  assert.equal((await invoke('issues.sync', { ...syncInput, state_id: 'done-1' })).comment_url, 'https://linear.app/comment/1');
  assert.equal(calls.length, 5);
});

test('speaks the manifest C2 handshake and rejects unsupported invocations without network access', { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, [join(__dirname, 'plugin.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  child.on('exit', (code) => {
    for (const { reject } of pending.values()) reject(new Error(`Plugin exited (${code}): ${stderr}`));
    pending.clear();
  });
  lines.on('line', (line) => { const message = JSON.parse(line); pending.get(message.id)?.resolve(message); pending.delete(message.id); });
  const request = (id, method, params) => new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    child.stdin.write('invalid json\nnull\n[]\n42\n');
    const response = await request(1, 'initialize', { protocolVersion: '1.0.0', host: { name: 'test', version: '0.0.0', commands: [] }, config: null, dataDir: '/tmp' });
    const extension = manifest.extensions['dev.codetwo'];
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.result.name, manifest.name);
    assert.equal(response.result.version, manifest.version);
    assert.equal(response.result.protocolVersion, extension.runtime.protocol);
    assert.deepEqual(response.result.commands.map(({ name }) => name), extension.commands.map(({ id }) => id));
    const error = await request(2, 'command/invoke', { name: 'linear.request', args: { operation: 'unsupported' } });
    assert.equal(error.error.code, -32000);
    assert.match(error.error.message, /Unsupported/);
    const unknown = await request(3, 'unknown');
    assert.equal(unknown.error.code, -32000);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.stdin.end();
      await exited;
    }
    lines.close();
  }
});
