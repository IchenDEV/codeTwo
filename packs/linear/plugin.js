#!/usr/bin/env node
const { createHash } = require('node:crypto');
const { createInterface } = require('node:readline');

const ISSUE_FIELDS = `id identifier title url description updatedAt priority
  state { id name type } team { id name key } assignee { id name }`;
function required(value, name, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}`);
  return value.trim();
}
function issueIdentifier(value) {
  const text = required(value, 'issue identifier');
  if (/^[a-zA-Z][a-zA-Z0-9]*-\d+$/.test(text) || /^[0-9a-f-]{36}$/i.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { throw new Error('Enter a Linear issue identifier or URL.'); }
  const match = url.pathname.match(/\/issue\/([a-zA-Z][a-zA-Z0-9]*-\d+)(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'linear.app' || !match) throw new Error('Invalid Linear issue URL.');
  return match[1];
}
function commentId(key) {
  const bytes = createHash('sha256').update(`codetwo.linear:${key}`).digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.subarray(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function normalizeIssue(issue, workspaceId) {
  if (!issue?.id || !issue.identifier || !issue.team?.id) throw new Error('Linear returned an incomplete issue.');
  return {
    workspace_id: workspaceId, id: issue.id, identifier: issue.identifier, title: issue.title,
    url: issue.url, description: issue.description || '', updated_at: issue.updatedAt,
    team_id: issue.team.id, team_name: issue.team.name, state: issue.state,
    assignee: issue.assignee, priority: issue.priority,
    comments: issue.comments?.nodes || [], attachments: issue.attachments?.nodes || [],
    comments_more: issue.comments?.pageInfo?.hasNextPage || false,
    comments_cursor: issue.comments?.pageInfo?.endCursor || null,
    attachments_more: issue.attachments?.pageInfo?.hasNextPage || false,
    attachments_cursor: issue.attachments?.pageInfo?.endCursor || null,
    parent: issue.parent || null, children: issue.children?.nodes || [],
  };
}

function createAdapter(fetcher = fetch) {
  async function graphql(credential, query, variables = {}) {
    required(credential, 'credential', 8192);
    let response;
    try {
      response = await fetcher('https://api.linear.app/graphql', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: credential, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
    } catch { throw new Error('Linear request failed or timed out. Retry after checking the connection.'); }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'Linear authentication failed. Reconnect with a valid API key.'
      : `Linear request failed (HTTP ${response.status}).`);
    // Bound responses before parsing; neither credentials nor raw remote errors leave this adapter.
    const reader = response.body.getReader();
    let size = 0; const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 750_000) throw new Error('Linear response is too large. Narrow the query.');
        chunks.push(Buffer.from(value));
      }
    } catch { throw new Error('Linear response could not be read within its size and time limits.'); }
    finally { await reader.cancel().catch(() => {}); }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('Linear returned an invalid response.'); }
    if (payload.errors?.length || !payload.data) throw new Error('Linear could not complete this operation. Check permissions and retry.');
    return payload.data;
  }
  return async function invoke(operation, input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Connector input must be an object.');
    const credential = input._credential;
    if (operation === 'connection.info') {
      const data = await graphql(credential, `query Connection {
        viewer { id name } organization { id name }
        teams(first:100) { nodes { id key name states { nodes { id name type } } } pageInfo { hasNextPage } }
      }`);
      return { account: data.viewer, workspace: data.organization, teams: data.teams.nodes, teams_more: data.teams.pageInfo.hasNextPage };
    }
    if (operation === 'issues.list') {
      const filter = {};
      if (input.team_id) filter.team = { id: { eq: required(input.team_id, 'team') } };
      if (input.assignee_id) filter.assignee = { id: { eq: required(input.assignee_id, 'assignee') } };
      if (input.query) filter.title = { containsIgnoreCase: required(input.query, 'search', 200) };
      const data = await graphql(credential, `query Issues($filter:IssueFilter,$after:String) {
        organization { id } issues(first:30,after:$after,filter:$filter,orderBy:updatedAt) {
          nodes { ${ISSUE_FIELDS} } pageInfo { hasNextPage endCursor }
        }
      }`, { filter, after: input.cursor || null });
      return { items: data.issues.nodes.map((issue) => normalizeIssue(issue, data.organization.id)),
        cursor: data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null };
    }
    if (operation === 'issues.get') {
      const data = await graphql(credential, `query Issue($id:String!) {
        organization { id } issue(id:$id) { ${ISSUE_FIELDS}
          comments(first:100) { nodes { id body updatedAt user { id name } } pageInfo { hasNextPage endCursor } }
          attachments(first:50) { nodes { id title url } pageInfo { hasNextPage endCursor } }
          parent { id identifier title url } children(first:50) { nodes { id identifier title url } }
        }
      }`, { id: issueIdentifier(input.id) });
      if (!data.issue) throw new Error('Linear issue was not found.');
      return normalizeIssue(data.issue, data.organization.id);
    }
    if (operation === 'issues.comments' || operation === 'issues.attachments') {
      const field = operation === 'issues.comments' ? 'comments' : 'attachments';
      const fields = field === 'comments' ? 'id body updatedAt user { id name }' : 'id title url';
      const data = await graphql(credential, `query IssuePage($id:String!,$after:String) {
        issue(id:$id) { ${field}(first:100,after:$after) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } }
      }`, { id: issueIdentifier(input.id), after: input.cursor || null });
      if (!data.issue) throw new Error('Linear issue was not found.');
      const page = data.issue[field];
      return { items: page.nodes, cursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null };
    }
    if (operation === 'issues.sync') {
      const issueId = issueIdentifier(input.id);
      const workspaceId = required(input.workspace_id, 'workspace');
      const body = required(input.body, 'comment', 24_000);
      const key = required(input.key, 'sync key', 200);
      const identity = await graphql(credential, `query Identity($id:String!) {
        organization { id } issue(id:$id) { id team { id } }
      }`, { id: issueId });
      if (identity.organization.id !== workspaceId || !identity.issue) throw new Error('This credential belongs to a different workspace or issue.');
      const id = commentId(`${workspaceId}:${identity.issue.id}:${key}`);
      // Scan existing comments first; the deterministic create ID also protects ambiguous retries.
      let after = null, found = null;
      for (let page = 0; page < 20; page++) {
        const data = await graphql(credential, `query Comments($id:String!,$after:String) {
          issue(id:$id) { comments(first:100,after:$after) { nodes { id url } pageInfo { hasNextPage endCursor } } }
        }`, { id: issueId, after });
        const comments = data.issue.comments;
        found = comments.nodes.find((comment) => comment.id === id);
        if (found || !comments.pageInfo.hasNextPage) break;
        if (page === 19) throw new Error('Could not verify earlier sync comments. No duplicate was posted.');
        after = comments.pageInfo.endCursor;
      }
      if (!found) {
        const data = await graphql(credential, `mutation Comment($input:CommentCreateInput!) {
          commentCreate(input:$input) { success comment { id url } }
        }`, { input: { id, issueId: identity.issue.id, body } });
        if (!data.commentCreate.success || !data.commentCreate.comment) throw new Error('Linear did not confirm the comment.');
        found = data.commentCreate.comment;
      }
      if (input.state_id) {
        const data = await graphql(credential, `query State($id:String!) { workflowState(id:$id) { id type team { id } } }`, { id: required(input.state_id, 'state') });
        if (data.workflowState?.team?.id !== identity.issue.team.id) throw new Error('The selected state belongs to another team.');
        const update = await graphql(credential, `mutation StateUpdate($id:String!,$input:IssueUpdateInput!) {
          issueUpdate(id:$id,input:$input) { success }
        }`, { id: identity.issue.id, input: { stateId: data.workflowState.id } });
        if (!update.issueUpdate.success) throw new Error('Linear did not confirm the state update.');
      }
      return { comment_url: found.url };
    }
    throw new Error('Unsupported Linear operation.');
  };
}

if (require.main === module) {
  const invoke = createAdapter();
  const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
  let active = 0;
  createInterface({ input: process.stdin }).on('line', async (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.id === undefined) return;
    if (++active > 8) { active--; send({ jsonrpc:'2.0', id:message.id, error:{code:-32000,message:'Linear connector is busy.'} }); return; }
    try {
      let result;
      if (message.method === 'initialize') result = {
        name:'linear', version:'0.1.0', protocolVersion:'1.0.0', commands:[{name:'linear.request'}], events:[],
      };
      else if (message.method === 'command/invoke' && message.params?.name === 'linear.request') {
        result = await invoke(message.params.args?.operation, message.params.args?.input);
      } else throw new Error('Unsupported protocol method.');
      send({ jsonrpc:'2.0', id:message.id, result });
    } catch (error) {
      send({ jsonrpc:'2.0', id:message.id, error:{code:-32000,message:error.message} });
    } finally { active--; }
  });
}
module.exports = { createAdapter, issueIdentifier, commentId };
