//! Form elicitation: the structured-question channel agents use to ask the user something.
//!
//! ACP's `elicitation/create` (UNSTABLE) hands the client a JSON Schema and asks it to render a
//! form. Claude Code's built-in `AskUserQuestion` tool is the case that motivated this module: the
//! adapter only routes it here when we advertise `elicitation.form` at `initialize`, and otherwise
//! degrades it into a bare allow/reject permission prompt that shows the user "Tool call —
//! AskUserQuestion" and none of the actual questions.
//!
//! Parsing lives in the core, not the frontend: every client (desktop, TUI, the remote server)
//! then renders the same normalized [`ElicitationForm`] instead of re-deriving one from a schema.
//! It is lenient like the rest of our wire handling — an unusable property is dropped, not fatal —
//! and the answer is validated back against the same form so a client can never invent a value the
//! agent didn't offer.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Longest free-text answer we forward. Bounded because it lands in the agent's context.
const MAX_TEXT_LEN: usize = 8_192;
/// Bounds on what one form may carry, so a malformed schema can't fill the UI (or the store).
const MAX_FIELDS: usize = 32;
const MAX_OPTIONS: usize = 64;
const MAX_LABEL_LEN: usize = 512;
const MAX_MESSAGE_LEN: usize = 4_096;

/// `_meta` key the Claude adapter uses to carry an option's `preview` — the one option field ACP's
/// enum options still have no slot for.
const OPTION_META_KEY: &str = "_claude/askUserQuestionOption";
/// Cross-agent `_meta` marker for the free-text "Other" box that accompanies a select question.
/// Deliberately un-namespaced upstream so every AskUserQuestion bridge can be recognized the same.
const CUSTOM_ANSWER_META_KEY: &str = "_askUserQuestionCustomAnswer";

/// What a client should render for one field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ElicitationFieldKind {
    /// Free text.
    Text,
    Number,
    Integer,
    Boolean,
    /// Pick exactly one of [`ElicitationField::options`].
    Select,
    /// Pick any number of [`ElicitationField::options`].
    MultiSelect,
}

/// One offered choice. `value` is what travels back to the agent; `label` is what the user reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ElicitationOption {
    pub value: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Longer preview content (mockups, snippets) shown when the option is focused.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
}

/// One question in the form.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ElicitationField {
    /// The schema property name; the key an answer is submitted under.
    pub key: String,
    pub kind: ElicitationFieldKind,
    /// Short header (`title`), when the agent supplied one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The question text. Absent for a single-question form, where the message carries it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub required: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<ElicitationOption>,
    /// Set when this text field is the "Other" box belonging to another field: the key of that
    /// field. Clients render it inside that question rather than as a question of its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_answer_for: Option<String>,
}

impl ElicitationField {
    fn selectable(&self) -> bool {
        matches!(
            self.kind,
            ElicitationFieldKind::Select | ElicitationFieldKind::MultiSelect
        )
    }
}

/// A normalized, render-ready form. Produced by [`parse_form`] from an ACP `requestedSchema`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ElicitationForm {
    /// Human-readable prompt. For a single-question AskUserQuestion this *is* the question.
    pub message: String,
    /// The tool call this form belongs to, when the agent correlated one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    pub fields: Vec<ElicitationField>,
}

/// What the user did with a form. Mirrors ACP's response actions: `decline` is "skipped, carry on"
/// (the agent is told nothing was chosen), `cancel` aborts the tool call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ElicitationAnswer {
    Accept {
        #[serde(default)]
        content: Map<String, Value>,
    },
    Decline,
    Cancel,
}

/// Option id used by clients that can only answer permission-shaped prompts, meaning "skip".
pub const SKIP_OPTION_ID: &str = "__elicitation_skip";

impl ElicitationForm {
    /// The fields a user actually answers — the "Other" boxes hang off these.
    pub fn questions(&self) -> impl Iterator<Item = &ElicitationField> {
        self.fields
            .iter()
            .filter(|field| field.custom_answer_for.is_none())
    }

    /// The single select question, when the form is exactly one — the shape that can be honestly
    /// projected onto a legacy permission prompt.
    fn lone_select(&self) -> Option<&ElicitationField> {
        let mut questions = self.questions();
        let first = questions.next()?;
        (questions.next().is_none() && first.selectable() && !first.options.is_empty())
            .then_some(first)
    }

    /// Permission-shaped `(option_id, label)` pairs, so a client that only knows how to answer a
    /// permission request can still answer the common single-question form. Anything richer offers
    /// just "Skip": inventing an answer to a form we can't show would be worse than deferring.
    pub fn legacy_options(&self) -> Vec<(String, String)> {
        let mut options = match self.lone_select() {
            Some(field) => field
                .options
                .iter()
                .enumerate()
                .map(|(index, option)| (legacy_option_id(&field.key, index), option.label.clone()))
                .collect(),
            None => Vec::new(),
        };
        options.push((SKIP_OPTION_ID.to_string(), "Skip".to_string()));
        options
    }

    /// Resolve a legacy permission answer against this form.
    pub fn answer_from_legacy_option(&self, option_id: Option<&str>) -> ElicitationAnswer {
        let Some(option_id) = option_id else {
            return ElicitationAnswer::Cancel;
        };
        if option_id == SKIP_OPTION_ID {
            return ElicitationAnswer::Decline;
        }
        let Some((key, index)) = parse_legacy_option_id(option_id) else {
            return ElicitationAnswer::Decline;
        };
        let Some(field) = self.fields.iter().find(|field| field.key == key) else {
            return ElicitationAnswer::Decline;
        };
        let Some(option) = field.options.get(index) else {
            return ElicitationAnswer::Decline;
        };
        let value = match field.kind {
            ElicitationFieldKind::MultiSelect => {
                Value::Array(vec![Value::from(option.value.clone())])
            }
            _ => Value::from(option.value.clone()),
        };
        let mut content = Map::new();
        content.insert(field.key.clone(), value);
        ElicitationAnswer::Accept { content }
    }

    /// Keep only what this form actually asked for. Unknown keys and values the agent never
    /// offered are dropped rather than forwarded — a client cannot widen the agent's own options.
    pub fn sanitize_content(&self, content: &Map<String, Value>) -> Map<String, Value> {
        let mut out = Map::new();
        for field in &self.fields {
            let Some(value) = content.get(&field.key) else {
                continue;
            };
            if let Some(value) = sanitize_value(field, value) {
                out.insert(field.key.clone(), value);
            }
        }
        out
    }
}

fn sanitize_value(field: &ElicitationField, value: &Value) -> Option<Value> {
    match field.kind {
        ElicitationFieldKind::Text => {
            let text = value.as_str()?.trim();
            (!text.is_empty()).then(|| Value::from(truncate(text, MAX_TEXT_LEN)))
        }
        ElicitationFieldKind::Number => value.as_f64().map(Value::from),
        ElicitationFieldKind::Integer => value.as_i64().map(Value::from),
        ElicitationFieldKind::Boolean => value.as_bool().map(Value::from),
        ElicitationFieldKind::Select => {
            let selected = value.as_str()?;
            offered(field, selected).map(Value::from)
        }
        ElicitationFieldKind::MultiSelect => {
            let selected = value
                .as_array()?
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|item| offered(field, item))
                .map(Value::from)
                .collect::<Vec<_>>();
            (!selected.is_empty()).then_some(Value::Array(selected))
        }
    }
}

/// A select field with no advertised options is a free-form string in select's clothing; anything
/// else must match an option the agent listed.
fn offered(field: &ElicitationField, value: &str) -> Option<String> {
    if field.options.is_empty() {
        let value = value.trim();
        return (!value.is_empty()).then(|| truncate(value, MAX_TEXT_LEN));
    }
    field
        .options
        .iter()
        .find(|option| option.value == value)
        .map(|option| option.value.clone())
}

fn legacy_option_id(key: &str, index: usize) -> String {
    format!("{key}#{index}")
}

fn parse_legacy_option_id(option_id: &str) -> Option<(&str, usize)> {
    let (key, index) = option_id.rsplit_once('#')?;
    Some((key, index.parse().ok()?))
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

/// `_meta.<key>.<field>` as a string. Walked by hand rather than with a JSON Pointer because the
/// keys agents namespace this way contain `/`, which a pointer would read as another path step.
fn meta_string(schema: &Value, key: &str, field: &str) -> Option<String> {
    schema
        .get("_meta")?
        .get(key)?
        .get(field)?
        .as_str()
        .map(|value| truncate(value, MAX_TEXT_LEN))
}

fn string_field(value: &Value, key: &str, max: usize) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(|text| truncate(text, max))
}

/// Read one enum option from either wire shape: a titled object (`{const, title, description}`) or
/// a bare string, which several agents still send for plain `enum` lists.
fn parse_option(value: &Value) -> Option<ElicitationOption> {
    if let Some(text) = value.as_str() {
        let text = text.trim();
        if text.is_empty() {
            return None;
        }
        let value = truncate(text, MAX_LABEL_LEN);
        return Some(ElicitationOption {
            label: value.clone(),
            value,
            description: None,
            preview: None,
        });
    }
    let constant = string_field(value, "const", MAX_LABEL_LEN)?;
    let label = string_field(value, "title", MAX_LABEL_LEN).unwrap_or_else(|| constant.clone());
    Some(ElicitationOption {
        value: constant,
        label,
        description: string_field(value, "description", MAX_TEXT_LEN),
        preview: meta_string(value, OPTION_META_KEY, "preview"),
    })
}

/// Collect a property's choices from any of the shapes agents use: `oneOf`/`anyOf` lists of titled
/// options, or a flat `enum` (optionally paired with `enumNames`).
fn parse_options(schema: &Value) -> Vec<ElicitationOption> {
    for key in ["oneOf", "anyOf"] {
        if let Some(items) = schema.get(key).and_then(Value::as_array) {
            let options: Vec<_> = items.iter().filter_map(parse_option).collect();
            if !options.is_empty() {
                return options.into_iter().take(MAX_OPTIONS).collect();
            }
        }
    }
    let Some(values) = schema.get("enum").and_then(Value::as_array) else {
        return Vec::new();
    };
    let names = schema.get("enumNames").and_then(Value::as_array);
    values
        .iter()
        .enumerate()
        .filter_map(|(index, value)| {
            let mut option = parse_option(value)?;
            if let Some(name) = names
                .and_then(|names| names.get(index))
                .and_then(Value::as_str)
            {
                option.label = truncate(name, MAX_LABEL_LEN);
            }
            Some(option)
        })
        .take(MAX_OPTIONS)
        .collect()
}

fn parse_field(key: &str, schema: &Value, required: bool) -> Option<ElicitationField> {
    let declared = schema
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("string");
    let (kind, options) = match declared {
        "array" => {
            let items = schema.get("items").unwrap_or(&Value::Null);
            (ElicitationFieldKind::MultiSelect, parse_options(items))
        }
        "number" => (ElicitationFieldKind::Number, Vec::new()),
        "integer" => (ElicitationFieldKind::Integer, Vec::new()),
        "boolean" => (ElicitationFieldKind::Boolean, Vec::new()),
        // Anything else (including "string" and unknown future types) is text unless it enumerates
        // choices — the lenient default keeps an odd schema answerable instead of unrenderable.
        _ => {
            let options = parse_options(schema);
            let kind = if options.is_empty() {
                ElicitationFieldKind::Text
            } else {
                ElicitationFieldKind::Select
            };
            (kind, options)
        }
    };
    // A multi-select with nothing to select is not a question we can render.
    if kind == ElicitationFieldKind::MultiSelect && options.is_empty() {
        return None;
    }
    Some(ElicitationField {
        key: key.to_string(),
        kind,
        title: string_field(schema, "title", MAX_LABEL_LEN),
        description: string_field(schema, "description", MAX_TEXT_LEN),
        required,
        options,
        custom_answer_for: meta_string(schema, CUSTOM_ANSWER_META_KEY, "questionId")
            .map(|key| truncate(&key, MAX_LABEL_LEN)),
    })
}

/// Normalize an ACP form elicitation into something a UI can render directly.
///
/// Returns `None` when the request carries no answerable field, which is how a caller decides to
/// decline instead of showing the user an empty dialog.
pub fn parse_form(
    message: &str,
    tool_call_id: Option<&str>,
    requested_schema: &Value,
) -> Option<ElicitationForm> {
    let required: Vec<&str> = requested_schema
        .get("required")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let properties = requested_schema
        .get("properties")
        .and_then(Value::as_object)?;
    let mut fields: Vec<ElicitationField> = properties
        .iter()
        .filter_map(|(key, schema)| parse_field(key, schema, required.contains(&key.as_str())))
        .take(MAX_FIELDS)
        .collect();
    // A companion "Other" box whose question didn't survive parsing would float free; re-home it
    // as a question of its own rather than dropping the user's only way to answer.
    let keys: Vec<String> = fields.iter().map(|field| field.key.clone()).collect();
    for field in &mut fields {
        if field
            .custom_answer_for
            .as_ref()
            .is_some_and(|owner| !keys.contains(owner))
        {
            field.custom_answer_for = None;
        }
    }
    if fields.is_empty() || fields.iter().all(|field| field.custom_answer_for.is_some()) {
        return None;
    }
    Some(ElicitationForm {
        message: truncate(message.trim(), MAX_MESSAGE_LEN),
        tool_call_id: tool_call_id
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(|id| truncate(id, MAX_LABEL_LEN)),
        fields,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The schema `@agentclientprotocol/claude-agent-acp` builds for AskUserQuestion.
    fn ask_user_question_schema() -> Value {
        json!({
            "type": "object",
            "properties": {
                "question_0": {
                    "type": "string",
                    "title": "Auth method",
                    "oneOf": [
                        {"const": "OAuth", "title": "OAuth", "description": "Redirect flow"},
                        {
                            "const": "API key",
                            "title": "API key",
                            "_meta": {"_claude/askUserQuestionOption": {"preview": "KEY=..."}}
                        }
                    ]
                },
                "question_0_custom": {
                    "type": "string",
                    "title": "Other",
                    "description": "Type your own answer instead of choosing an option above (optional).",
                    "_meta": {
                        "_askUserQuestionCustomAnswer": {
                            "questionId": "question_0",
                            "isCustomAnswer": true
                        }
                    }
                }
            }
        })
    }

    #[test]
    fn parses_the_ask_user_question_form() {
        let form = parse_form(
            "Which auth method?",
            Some("tool-1"),
            &ask_user_question_schema(),
        )
        .expect("an answerable form");
        assert_eq!(form.message, "Which auth method?");
        assert_eq!(form.tool_call_id.as_deref(), Some("tool-1"));
        assert_eq!(form.questions().count(), 1);

        let question = form.questions().next().unwrap();
        assert_eq!(question.key, "question_0");
        assert_eq!(question.kind, ElicitationFieldKind::Select);
        assert_eq!(question.title.as_deref(), Some("Auth method"));
        assert_eq!(question.options.len(), 2);
        assert_eq!(
            question.options[0].description.as_deref(),
            Some("Redirect flow")
        );
        assert_eq!(question.options[1].preview.as_deref(), Some("KEY=..."));

        let custom = form
            .fields
            .iter()
            .find(|field| field.key == "question_0_custom")
            .expect("the per-question Other box");
        assert_eq!(custom.custom_answer_for.as_deref(), Some("question_0"));
        assert_eq!(custom.kind, ElicitationFieldKind::Text);
    }

    #[test]
    fn parses_multi_select_and_plain_enums() {
        let form = parse_form(
            "Pick",
            None,
            &json!({
                "type": "object",
                "required": ["features"],
                "properties": {
                    "features": {
                        "type": "array",
                        "description": "Which features?",
                        "items": {"anyOf": [{"const": "a", "title": "A"}, {"const": "b", "title": "B"}]}
                    },
                    "region": {"type": "string", "enum": ["us", "eu"], "enumNames": ["US", "Europe"]}
                }
            }),
        )
        .expect("an answerable form");

        let features = &form.fields[0];
        assert_eq!(features.key, "features");
        assert_eq!(features.kind, ElicitationFieldKind::MultiSelect);
        assert!(features.required);
        let region = &form.fields[1];
        assert_eq!(region.kind, ElicitationFieldKind::Select);
        assert_eq!(region.options[1].value, "eu");
        assert_eq!(region.options[1].label, "Europe");
        assert!(!region.required);
    }

    #[test]
    fn rejects_forms_with_nothing_to_answer() {
        assert!(parse_form("hi", None, &json!({"type": "object"})).is_none());
        assert!(parse_form("hi", None, &json!({"type": "object", "properties": {}})).is_none());
        // A lone "Other" box whose question vanished is still answerable, as a text question.
        let orphan = parse_form(
            "hi",
            None,
            &json!({"type": "object", "properties": {
                "question_0_custom": {
                    "type": "string",
                    "_meta": {"_askUserQuestionCustomAnswer": {"questionId": "question_0"}}
                }
            }}),
        )
        .expect("re-homed as its own question");
        assert!(orphan.fields[0].custom_answer_for.is_none());
    }

    #[test]
    fn sanitize_drops_values_the_agent_never_offered() {
        let form = parse_form("Which auth method?", None, &ask_user_question_schema()).unwrap();
        let content = form.sanitize_content(
            json!({
                "question_0": "Something else",
                "question_0_custom": "  mTLS  ",
                "unknown": "ignored"
            })
            .as_object()
            .unwrap(),
        );
        assert_eq!(content.len(), 1);
        assert_eq!(content["question_0_custom"], json!("mTLS"));

        let content = form.sanitize_content(json!({"question_0": "OAuth"}).as_object().unwrap());
        assert_eq!(content["question_0"], json!("OAuth"));
    }

    #[test]
    fn sanitize_keeps_only_offered_multi_select_members() {
        let form = parse_form(
            "Pick",
            None,
            &json!({"type": "object", "properties": {
                "features": {"type": "array", "items": {"anyOf": [{"const": "a", "title": "A"}]}}
            }}),
        )
        .unwrap();
        let content = form.sanitize_content(json!({"features": ["a", "zzz"]}).as_object().unwrap());
        assert_eq!(content["features"], json!(["a"]));
        // Nothing offered survived: the field is omitted rather than sent as an empty answer.
        let empty = form.sanitize_content(json!({"features": ["zzz"]}).as_object().unwrap());
        assert!(empty.is_empty());
    }

    #[test]
    fn a_single_question_projects_onto_permission_options() {
        let form = parse_form("Which auth method?", None, &ask_user_question_schema()).unwrap();
        let options = form.legacy_options();
        assert_eq!(
            options
                .iter()
                .map(|(_, label)| label.as_str())
                .collect::<Vec<_>>(),
            ["OAuth", "API key", "Skip"]
        );

        match form.answer_from_legacy_option(Some(&options[0].0)) {
            ElicitationAnswer::Accept { content } => {
                assert_eq!(content["question_0"], json!("OAuth"))
            }
            other => panic!("unexpected answer: {other:?}"),
        }
        assert_eq!(
            form.answer_from_legacy_option(Some(SKIP_OPTION_ID)),
            ElicitationAnswer::Decline
        );
        assert_eq!(
            form.answer_from_legacy_option(None),
            ElicitationAnswer::Cancel
        );
        // An id from another form can only ever skip; it can never fabricate an answer.
        assert_eq!(
            form.answer_from_legacy_option(Some("question_9#3")),
            ElicitationAnswer::Decline
        );
    }

    #[test]
    fn multi_question_forms_offer_only_skip_to_permission_only_clients() {
        let form = parse_form(
            "Please answer the following questions.",
            None,
            &json!({"type": "object", "properties": {
                "question_0": {"type": "string", "oneOf": [{"const": "a", "title": "A"}]},
                "question_1": {"type": "string", "oneOf": [{"const": "b", "title": "B"}]}
            }}),
        )
        .unwrap();
        assert_eq!(
            form.legacy_options(),
            vec![(SKIP_OPTION_ID.to_string(), "Skip".to_string())]
        );
    }
}
