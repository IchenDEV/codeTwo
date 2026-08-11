//! Minimal stdio MCP façade for the built-in browser.
//!
//! The sidecar owns no browser state and has no private WebKit handle. Every operation crosses the
//! authenticated owner-only Unix socket and is revalidated by the desktop broker.

use std::collections::BTreeSet;
use std::io::{BufRead, BufReader, Write};

use serde_json::{json, Value};

const INSTRUCTIONS: &str = "For ordinary browser requests use CodeTwo Browser by default. Use Chrome only when the user explicitly asks for Chrome, an existing tab, or an existing login state. Never claim an action completed until the tool result confirms it. Website access and sensitive actions may require user approval; file uploads require user takeover.";

#[cfg(unix)]
struct Sidecar {
    socket_path: String,
    session: String,
    key: String,
    session_origins: BTreeSet<String>,
    next_request_id: u64,
}

#[cfg(unix)]
impl Sidecar {
    fn from_env() -> Result<Self, String> {
        let read = |name: &str| {
            std::env::var(name).map_err(|_| format!("missing required environment: {name}"))
        };
        Ok(Self {
            socket_path: read("CODETWO_BROWSER_SOCKET")?,
            session: read("CODETWO_BROWSER_SESSION")?,
            key: read("CODETWO_BROWSER_SESSION_KEY")?,
            session_origins: BTreeSet::new(),
            next_request_id: 1,
        })
    }

    fn broker(
        &self,
        method: &str,
        params: Value,
        approved: bool,
        scope: Option<&str>,
    ) -> Result<Value, String> {
        use std::os::unix::net::UnixStream;
        // The desktop starts the broker and engine in the same setup callback. A freshly spawned
        // sidecar can win that race, so tolerate only a short startup window rather than turning
        // the first browser request into a false permanent failure.
        let mut stream = {
            let mut last_error = None;
            let mut connected = None;
            for attempt in 0..10 {
                match UnixStream::connect(&self.socket_path) {
                    Ok(stream) => {
                        connected = Some(stream);
                        break;
                    }
                    Err(error) => {
                        last_error = Some(error);
                        if attempt < 9 {
                            std::thread::sleep(std::time::Duration::from_millis(25));
                        }
                    }
                }
            }
            connected.ok_or_else(|| {
                format!(
                    "CodeTwo Browser broker is unavailable: {}",
                    last_error
                        .map(|error| error.to_string())
                        .unwrap_or_else(|| "connection failed".into())
                )
            })?
        };
        let request = json!({
            "session": self.session,
            "key": self.key,
            "method": method,
            "params": params,
            "approved": approved,
            "approval_scope": scope,
        });
        serde_json::to_writer(&mut stream, &request).map_err(|error| error.to_string())?;
        stream.write_all(b"\n").map_err(|error| error.to_string())?;
        stream.flush().map_err(|error| error.to_string())?;
        let mut response = String::new();
        BufReader::new(stream)
            .read_line(&mut response)
            .map_err(|error| error.to_string())?;
        serde_json::from_str(&response).map_err(|error| error.to_string())
    }

    fn origin_is_session_allowed(&self, params: &Value) -> bool {
        params
            .get("url")
            .and_then(Value::as_str)
            .and_then(|url| tauri::Url::parse(url).ok())
            .map(|url| url.origin().ascii_serialization())
            .is_some_and(|origin| self.session_origins.contains(&origin))
    }

    fn call_tool<R: BufRead, W: Write>(
        &mut self,
        reader: &mut R,
        writer: &mut W,
        name: &str,
        params: Value,
    ) -> Result<Value, String> {
        let mut response = self.broker(
            name,
            params.clone(),
            self.origin_is_session_allowed(&params),
            None,
        )?;
        let Some(approval) = response.get("approval").cloned() else {
            return broker_result(response);
        };
        let kind = approval
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("sensitive_web_action");
        let title = approval
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Confirm browser action");
        let message = approval
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or(title);
        let origin = approval
            .get("origin")
            .and_then(Value::as_str)
            .map(str::to_string);
        let choices = if kind == "website_access" {
            vec!["once", "session", "permanent", "deny"]
        } else {
            vec!["allow_once", "deny"]
        };
        let elicitation_id = format!("codetwo-browser-{}", self.next_request_id);
        self.next_request_id += 1;
        write_json(
            writer,
            &json!({
                "jsonrpc": "2.0",
                "id": elicitation_id,
                "method": "elicitation/create",
                "params": {
                    "message": format!("{title}: {message}"),
                    "requestedSchema": {
                        "type": "object",
                        "properties": {
                            "decision": {
                                "type": "string",
                                "title": title,
                                "enum": choices,
                            }
                        },
                        "required": ["decision"],
                    }
                }
            }),
        )?;

        let answer = loop {
            let mut line = String::new();
            if reader
                .read_line(&mut line)
                .map_err(|error| error.to_string())?
                == 0
            {
                return Err("browser approval channel closed".into());
            }
            let message: Value = serde_json::from_str(&line).map_err(|error| error.to_string())?;
            if message.get("method").and_then(Value::as_str) == Some("notifications/cancelled") {
                return Err("browser approval was cancelled".into());
            }
            if message.get("method").and_then(Value::as_str) == Some("ping") {
                if let Some(id) = message.get("id").cloned() {
                    write_json(writer, &json!({ "jsonrpc": "2.0", "id": id, "result": {} }))?;
                }
                continue;
            }
            if message.get("id") == Some(&Value::String(elicitation_id.clone())) {
                break message;
            }
        };
        let Some(scope) = accepted_approval_scope(&answer) else {
            return Err(format!(
                "browser action was not approved ({})",
                approval_response_code(&answer)
            ));
        };
        if scope == "session" {
            if let Some(origin) = origin {
                self.session_origins.insert(origin);
            }
        }
        response = self.broker(name, params, true, Some(scope))?;
        broker_result(response)
    }
}

fn accepted_approval_scope(answer: &Value) -> Option<&'static str> {
    let payload = answer.get("result").unwrap_or(answer);
    let accepted = payload.get("action").and_then(Value::as_str) == Some("accept")
        || (payload.get("outcome").and_then(Value::as_str) == Some("selected")
            && payload
                .get("optionId")
                .and_then(Value::as_str)
                .is_some_and(|option| option.starts_with("allow") || option == "accept"));
    if !accepted {
        return None;
    }
    match payload.pointer("/content/decision").and_then(Value::as_str) {
        Some("deny") => None,
        Some("permanent" | "always") => Some("permanent"),
        Some("session") => Some("session"),
        Some("once" | "allow_once") => Some("once"),
        Some(_) => None,
        None => match payload.pointer("/_meta/persist").and_then(Value::as_str) {
            Some("always") => Some("permanent"),
            Some("session") => Some("session"),
            _ => Some("once"),
        },
    }
}

fn approval_response_code(answer: &Value) -> &'static str {
    let payload = answer.get("result").unwrap_or(answer);
    match payload.get("action").and_then(Value::as_str) {
        Some("decline") => "declined",
        Some("cancel") => "cancelled",
        Some("accept") => "invalid_accept_payload",
        Some(_) => "unknown_action",
        None if payload.get("outcome").is_some() => "unrecognized_permission_outcome",
        None => "missing_action",
    }
}

#[cfg(unix)]
fn broker_result(response: Value) -> Result<Value, String> {
    if response.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    } else {
        Err(response
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("CodeTwo Browser request failed")
            .to_string())
    }
}

fn tools() -> Value {
    json!([
        {
            "name": "browser_tabs",
            "description": "List, create, select, or close CodeTwo Browser tabs.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "command": { "type": "string", "enum": ["list", "create", "select", "close"] },
                    "tabId": { "type": "string" },
                    "url": { "type": "string" }
                },
                "required": ["command"],
                "additionalProperties": false
            }
        },
        {
            "name": "browser_navigate",
            "description": "Navigate a CodeTwo Browser tab. A new website origin requires approval.",
            "inputSchema": {
                "type": "object",
                "properties": { "tabId": { "type": "string" }, "url": { "type": "string" } },
                "required": ["tabId", "url"],
                "additionalProperties": false
            }
        },
        {
            "name": "browser_snapshot",
            "description": "Inspect a bounded accessibility-like DOM projection or take a native screenshot.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tabId": { "type": "string" },
                    "kind": { "type": "string", "enum": ["dom", "screenshot"], "default": "dom" }
                },
                "required": ["tabId"],
                "additionalProperties": false
            }
        },
        {
            "name": "browser_act",
            "description": "Perform one fixed browser action. Sensitive actions require one-time approval; file upload is unsupported.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tabId": { "type": "string" },
                    "action": {
                        "type": "object",
                        "properties": {
                            "kind": { "type": "string", "enum": ["click_node", "click_point", "input", "key", "scroll", "drag", "history", "reload"] },
                            "node_id": { "type": "string" },
                            "text": { "type": "string" },
                            "key": { "type": "string" },
                            "x": { "type": "number" }, "y": { "type": "number" },
                            "delta_x": { "type": "number" }, "delta_y": { "type": "number" },
                            "from_x": { "type": "number" }, "from_y": { "type": "number" },
                            "to_x": { "type": "number" }, "to_y": { "type": "number" },
                            "delta": { "type": "integer" }
                        },
                        "required": ["kind"],
                        "additionalProperties": false
                    }
                },
                "required": ["tabId", "action"],
                "additionalProperties": false
            }
        },
        {
            "name": "browser_finalize",
            "description": "Finish an agent browser run and return control of the tab to the user.",
            "inputSchema": {
                "type": "object",
                "properties": { "tabId": { "type": "string" } },
                "required": ["tabId"],
                "additionalProperties": false
            }
        }
    ])
}

fn tool_content(result: Value) -> Value {
    if result.get("kind").and_then(Value::as_str) == Some("screenshot") {
        return json!({
            "content": [{
                "type": "image",
                "data": result.get("data_base64").and_then(Value::as_str).unwrap_or(""),
                "mimeType": result.get("mime_type").and_then(Value::as_str).unwrap_or("image/png")
            }],
            "structuredContent": { "kind": "screenshot" }
        });
    }
    json!({
        "content": [{ "type": "text", "text": serde_json::to_string(&result).unwrap_or_else(|_| "null".into()) }],
        "structuredContent": result
    })
}

fn write_json<W: Write>(writer: &mut W, value: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut *writer, value).map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

/// Run the stdio server instead of booting Tauri. Called only for the private launch flag injected
/// by `DesktopMcpConfig`.
#[cfg(unix)]
pub fn run() -> Result<(), String> {
    let mut sidecar = Sidecar::from_env()?;
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = stdout.lock();
    loop {
        let mut line = String::new();
        if reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?
            == 0
        {
            return Ok(());
        }
        let message: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(method) = message.get("method").and_then(Value::as_str) else {
            continue;
        };
        let Some(id) = message.get("id").cloned() else {
            continue;
        };
        let result = match method {
            "initialize" => Ok(json!({
                "protocolVersion": message.pointer("/params/protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "codetwo_browser", "version": env!("CARGO_PKG_VERSION") },
                "instructions": INSTRUCTIONS,
            })),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => {
                let name = message
                    .pointer("/params/name")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let arguments = message
                    .pointer("/params/arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                sidecar
                    .call_tool(&mut reader, &mut writer, name, arguments)
                    .map(tool_content)
            }
            _ => Err(format!("unsupported MCP method: {method}")),
        };
        let response = match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(message) => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } })
            }
        };
        write_json(&mut writer, &response)?;
    }
}

#[cfg(not(unix))]
pub fn run() -> Result<(), String> {
    Err("CodeTwo Browser MCP is not implemented on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::{accepted_approval_scope, tool_content, tools};

    #[test]
    fn exposes_only_the_five_fixed_tools() {
        let definitions = tools();
        let names = definitions
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool.get("name").unwrap().as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            [
                "browser_tabs",
                "browser_navigate",
                "browser_snapshot",
                "browser_act",
                "browser_finalize"
            ]
        );
        assert!(!serde_json::to_string(&tools())
            .unwrap()
            .contains("javascript"));
    }

    #[test]
    fn screenshot_becomes_mcp_image_content() {
        let value = tool_content(serde_json::json!({
            "kind": "screenshot",
            "mime_type": "image/png",
            "data_base64": "aGVsbG8="
        }));
        assert_eq!(value.pointer("/content/0/type").unwrap(), "image");
    }

    #[test]
    fn accepts_codex_acp_tool_approval_responses_without_form_content() {
        assert_eq!(
            accepted_approval_scope(&serde_json::json!({
                "result": { "action": "accept", "content": null, "_meta": null }
            })),
            Some("once")
        );
        assert_eq!(
            accepted_approval_scope(&serde_json::json!({
                "result": {
                    "action": "accept",
                    "content": null,
                    "_meta": { "persist": "session" }
                }
            })),
            Some("session")
        );
        assert_eq!(
            accepted_approval_scope(&serde_json::json!({
                "result": { "action": "decline", "content": null }
            })),
            None
        );
    }
}
