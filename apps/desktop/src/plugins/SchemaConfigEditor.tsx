import { useEffect, useState } from "react";

import { Save } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { PluginManagerLabels } from "./types";

type JsonPrimitive = string | number | boolean | null;

interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: JsonPrimitive[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: unknown;
}

interface SimpleObjectSchema extends JsonSchema {
  properties: Record<string, JsonSchema>;
}

const supportedFieldTypes = new Set(["string", "number", "integer", "boolean"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asSimpleObjectSchema(value: unknown): SimpleObjectSchema | null {
  if (!isRecord(value) || !isRecord(value.properties)) {
    return null;
  }
  if (value.type !== undefined && value.type !== "object") {
    return null;
  }

  const properties = value.properties as Record<string, JsonSchema>;
  const isSupported = Object.values(properties).every((property) => {
    if (!isRecord(property)) {
      return false;
    }
    if (Array.isArray(property.enum) && property.enum.length > 0) {
      return property.enum.every(
        (entry) =>
          entry === null ||
          ["string", "number", "boolean"].includes(typeof entry)
      );
    }
    return (
      typeof property.type === "string" &&
      supportedFieldTypes.has(property.type)
    );
  });

  return isSupported ? ({ ...value, properties } as SimpleObjectSchema) : null;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function initialObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function enumKey(value: JsonPrimitive): string {
  return JSON.stringify(value);
}

function enumLabel(value: JsonPrimitive): string {
  return value === null ? "null" : String(value);
}

function updateProperty(
  current: Record<string, unknown>,
  name: string,
  value: unknown
): Record<string, unknown> {
  if (value !== undefined) {
    return { ...current, [name]: value };
  }
  const next = { ...current };
  delete next[name];
  return next;
}

const SchemaField = ({
  name,
  schema,
  required,
  value,
  onChange,
}: {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly required: boolean;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) => {
  const id = `plugin-config-${name}`;
  const label = schema.title ?? name;

  if (schema.enum?.length) {
    const items = schema.enum.map((entry) => ({
      label: enumLabel(entry),
      value: enumKey(entry),
    }));
    const selected =
      schema.enum.find((entry) => Object.is(entry, value)) ??
      schema.default ??
      schema.enum[0];
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {schema.description ? (
          <FieldDescription>{schema.description}</FieldDescription>
        ) : null}
        <Select
          items={items}
          value={enumKey(selected as JsonPrimitive)}
          onValueChange={(key) => {
            const next = schema.enum?.find((entry) => enumKey(entry) === key);
            if (next !== undefined) {
              onChange(next);
            }
          }}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (schema.type === "boolean") {
    return (
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={typeof value === "boolean" ? value : Boolean(schema.default)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {schema.description ? (
            <FieldDescription>{schema.description}</FieldDescription>
          ) : null}
        </div>
      </Field>
    );
  }

  const inputType =
    schema.type === "number" || schema.type === "integer" ? "number" : "text";
  const displayed = value ?? schema.default ?? "";
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {schema.description ? (
        <FieldDescription>{schema.description}</FieldDescription>
      ) : null}
      <Input
        id={id}
        type={inputType}
        step={schema.type === "integer" ? 1 : undefined}
        required={required}
        value={String(displayed)}
        onInput={(event) => {
          const raw = event.currentTarget.value;
          if (inputType === "text") {
            onChange(raw);
            return;
          }
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </Field>
  );
};

export const SchemaConfigEditor = ({
  config,
  schema,
  labels,
  onSave,
}: {
  readonly config: unknown;
  readonly schema: unknown;
  readonly labels: PluginManagerLabels;
  readonly onSave: (config: unknown) => Promise<void>;
}) => {
  const simpleSchema = asSimpleObjectSchema(schema);
  const incomingJson = formatJson(config);
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    initialObject(config)
  );
  const [json, setJson] = useState(incomingJson);
  const [mode, setMode] = useState<"form" | "json">(
    simpleSchema ? "form" : "json"
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initialObject(JSON.parse(incomingJson)));
    setJson(incomingJson);
    setJsonError(null);
    setSaveError(null);
  }, [incomingJson]);

  useEffect(() => {
    if (!simpleSchema) {
      setMode("json");
    }
  }, [simpleSchema]);

  const changeDraft = (name: string, value: unknown) => {
    const next = updateProperty(draft, name, value);
    setDraft(next);
    setJson(formatJson(next));
  };

  const save = async () => {
    if (saving) {
      return;
    }
    setJsonError(null);
    setSaveError(null);
    let next: unknown = draft;
    if (mode === "json") {
      try {
        next = JSON.parse(json);
      } catch (error) {
        setJsonError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    if (simpleSchema && !isRecord(next)) {
      setJsonError(labels.invalidConfigurationObject);
      return;
    }

    setSaving(true);
    try {
      await onSave(next);
      setDraft(initialObject(next));
      setJson(formatJson(next));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <>
      {saveError ? (
        <p role="alert" className="text-callout text-destructive">
          {saveError}
        </p>
      ) : null}
      <Button
        type="button"
        size="compact"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Save data-icon="inline-start" />
        )}
        {saving ? labels.saving : labels.saveConfiguration}
      </Button>
    </>
  );

  const jsonEditor = (
    <Field data-invalid={Boolean(jsonError)}>
      <FieldLabel htmlFor="plugin-config-json">
        {labels.advancedJson}
      </FieldLabel>
      <Textarea
        id="plugin-config-json"
        className="text-callout min-h-64 font-mono"
        value={json}
        aria-invalid={Boolean(jsonError)}
        onChange={(event) => {
          setJson(event.currentTarget.value);
          setJsonError(null);
        }}
      />
      {jsonError ? <FieldError>{jsonError}</FieldError> : null}
    </Field>
  );

  if (!simpleSchema) {
    return (
      <div className="flex flex-col gap-4">
        {jsonEditor}
        {actions}
      </div>
    );
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        const next = value as "form" | "json";
        if (next === "json") {
          setJson(formatJson(draft));
        } else if (mode === "json") {
          try {
            const parsed = JSON.parse(json);
            if (!isRecord(parsed)) {
              throw new Error(labels.invalidConfigurationObject);
            }
            setDraft(parsed);
            setJsonError(null);
          } catch (error) {
            setJsonError(
              error instanceof Error ? error.message : String(error)
            );
            return;
          }
        }
        setMode(next);
      }}
      className="gap-4"
    >
      <TabsList variant="line">
        <TabsTrigger value="form">{labels.form}</TabsTrigger>
        <TabsTrigger value="json">{labels.advancedJson}</TabsTrigger>
      </TabsList>
      <TabsContent value="form" className="flex flex-col gap-4">
        <FieldGroup>
          {Object.entries(simpleSchema.properties).map(([name, property]) => (
            <SchemaField
              key={name}
              name={name}
              schema={property}
              required={simpleSchema.required?.includes(name) ?? false}
              value={draft[name]}
              onChange={(value) => changeDraft(name, value)}
            />
          ))}
        </FieldGroup>
        {actions}
      </TabsContent>
      <TabsContent value="json" className="flex flex-col gap-4">
        {jsonEditor}
        {actions}
      </TabsContent>
    </Tabs>
  );
};
