#!/usr/bin/env node

const { execFile } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const readline = require("node:readline");

const PLUGIN_NAME = "docker-tools";
const PLUGIN_VERSION = "0.1.0";
const PROTOCOL_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const COMMANDS = [
  {
    name: "docker.status",
    description: "Show Docker engine health, version, and resource counts.",
    schema: objectSchema({}),
  },
  {
    name: "docker.containers",
    description: "List Docker containers with stable structured fields.",
    schema: objectSchema({
      all: { type: "boolean", description: "Include stopped containers. Defaults to true." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Maximum results. Defaults to 100." },
    }),
  },
  {
    name: "docker.images",
    description: "List local Docker images with stable structured fields.",
    schema: objectSchema({
      all: { type: "boolean", description: "Include intermediate images. Defaults to false." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Maximum results. Defaults to 100." },
    }),
  },
  {
    name: "docker.inspect",
    description: "Inspect one Docker container.",
    schema: objectSchema({ container: containerSchema() }, ["container"]),
  },
  {
    name: "docker.logs",
    description: "Read a bounded tail of one Docker container's logs.",
    schema: objectSchema({
      container: containerSchema(),
      tail: { type: "integer", minimum: 1, maximum: 1000, description: "Lines to return. Defaults to 200." },
      timestamps: { type: "boolean", description: "Include Docker timestamps." },
      since: { type: "string", maxLength: 64, description: "Docker duration or timestamp, such as 10m or 2026-08-26T10:00:00Z." },
    }, ["container"]),
  },
  {
    name: "docker.start",
    description: "Start one stopped Docker container.",
    schema: objectSchema({ container: containerSchema() }, ["container"]),
  },
  {
    name: "docker.stop",
    description: "Stop one running Docker container.",
    schema: objectSchema({
      container: containerSchema(),
      timeout: { type: "integer", minimum: 0, maximum: 300, description: "Seconds before Docker kills the container. Defaults to Docker's setting." },
    }, ["container"]),
  },
  {
    name: "docker.restart",
    description: "Restart one Docker container.",
    schema: objectSchema({
      container: containerSchema(),
      timeout: { type: "integer", minimum: 0, maximum: 300, description: "Seconds before Docker kills the container. Defaults to Docker's setting." },
    }, ["container"]),
  },
  {
    name: "docker.pull",
    description: "Pull one Docker image by repository, tag, or digest.",
    schema: objectSchema({ image: imageSchema() }, ["image"]),
  },
  {
    name: "docker.remove_image",
    description: "Remove one local Docker image.",
    schema: objectSchema({
      image: imageSchema(),
      force: { type: "boolean", description: "Force removal when Docker permits it." },
    }, ["image"]),
  },
];

function objectSchema(properties, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
    properties,
  };
}

function containerSchema() {
  return {
    type: "string",
    minLength: 1,
    maxLength: 255,
    description: "Container name or ID.",
  };
}

function imageSchema() {
  return {
    type: "string",
    minLength: 1,
    maxLength: 512,
    description: "Image repository, tag, digest, or ID.",
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dockerExecutable() {
  const override = process.env.C2_DOCKER_CLI?.trim();
  if (override) return override;

  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      "/Applications/Docker.app/Contents/Resources/bin/docker",
    );
    if (process.env.HOME) candidates.push(join(process.env.HOME, ".docker", "bin", "docker"));
  } else if (process.platform === "win32") {
    if (process.env.ProgramFiles) {
      candidates.push(join(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe"));
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? "docker";
}

function boundedDetail(value, limit = 2000) {
  const detail = String(value ?? "").trim();
  return detail.length <= limit ? detail : `${detail.slice(0, limit)}…`;
}

function dockerError(error, stderr) {
  if (error?.code === "ENOENT") {
    return new Error("Docker CLI was not found. Install Docker Desktop or make `docker` available to C2.");
  }
  if (error?.killed && error?.signal === "SIGTERM") {
    return new Error("Docker command timed out.");
  }
  const detail = boundedDetail(stderr || error?.message || error);
  return new Error(detail || "Docker command failed.");
}

function runDocker(args, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      dockerExecutable(),
      args,
      {
        encoding: "utf8",
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(dockerError(error, stderr));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function parseJsonLines(text, label) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => parseJson(line, label));
}

function integerArg(args, name, fallback, minimum, maximum) {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function booleanArg(args, name, fallback) {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function safeValue(args, name, { required = false, maximum = 255 } = {}) {
  const value = args[name];
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${name} is required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0") || normalized.startsWith("-")) {
    throw new Error(`${name} is invalid`);
  }
  return normalized;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function containerRecord(value) {
  return {
    id: value.ID ?? null,
    name: value.Names ?? null,
    image: value.Image ?? null,
    command: value.Command ?? null,
    createdAt: value.CreatedAt ?? null,
    runningFor: value.RunningFor ?? null,
    ports: value.Ports ?? null,
    state: value.State ?? null,
    status: value.Status ?? null,
    size: value.Size ?? null,
    labels: value.Labels ?? null,
    localVolumes: number(value.LocalVolumes),
    mounts: value.Mounts ?? null,
    networks: value.Networks ?? null,
  };
}

function imageRecord(value) {
  return {
    id: value.ID ?? null,
    repository: value.Repository ?? null,
    tag: value.Tag ?? null,
    digest: value.Digest ?? null,
    createdAt: value.CreatedAt ?? null,
    createdSince: value.CreatedSince ?? null,
    size: value.Size ?? null,
    sharedSize: value.SharedSize ?? null,
    uniqueSize: value.UniqueSize ?? null,
    containers: number(value.Containers),
  };
}

async function status() {
  const { stdout } = await runDocker(["info", "--format", "{{json .}}"]);
  const info = parseJson(stdout, "docker info");
  const result = {
    available: true,
    clientVersion: info.ClientInfo?.Version ?? null,
    serverVersion: info.ServerVersion ?? null,
    context: info.ClientInfo?.Context ?? null,
    engine: {
      name: info.Name ?? null,
      operatingSystem: info.OperatingSystem ?? null,
      architecture: info.Architecture ?? null,
      cpus: number(info.NCPU),
      memoryBytes: number(info.MemTotal),
      dockerRootDir: info.DockerRootDir ?? null,
    },
    containers: {
      total: number(info.Containers),
      running: number(info.ContainersRunning),
      paused: number(info.ContainersPaused),
      stopped: number(info.ContainersStopped),
    },
    images: number(info.Images),
  };
  result.message = [
    `Docker ${result.serverVersion ?? "engine"} is running`,
    `${result.containers.running} running`,
    `${result.containers.stopped} stopped`,
    `${result.images} images`,
  ].join(" · ");
  return result;
}

async function containers(args) {
  const all = booleanArg(args, "all", true);
  const limit = integerArg(args, "limit", 100, 1, 500);
  const dockerArgs = ["container", "ls"];
  if (all) dockerArgs.push("--all");
  dockerArgs.push("--no-trunc", "--format", "{{json .}}");
  const { stdout } = await runDocker(dockerArgs);
  const listed = parseJsonLines(stdout, "docker container ls");
  const values = listed.slice(0, limit).map(containerRecord);
  return {
    containers: values,
    count: values.length,
    truncated: listed.length > limit,
    message: `${values.length} Docker container${values.length === 1 ? "" : "s"}.`,
  };
}

async function images(args) {
  const all = booleanArg(args, "all", false);
  const limit = integerArg(args, "limit", 100, 1, 500);
  const dockerArgs = ["image", "ls"];
  if (all) dockerArgs.push("--all");
  dockerArgs.push("--digests", "--no-trunc", "--format", "{{json .}}");
  const { stdout } = await runDocker(dockerArgs);
  const listed = parseJsonLines(stdout, "docker image ls");
  const values = listed.slice(0, limit).map(imageRecord);
  return {
    images: values,
    count: values.length,
    truncated: listed.length > limit,
    message: `${values.length} Docker image${values.length === 1 ? "" : "s"}.`,
  };
}

async function inspect(args) {
  const container = safeValue(args, "container", { required: true });
  const { stdout } = await runDocker(["container", "inspect", container]);
  const inspected = parseJson(stdout, "docker container inspect");
  return {
    container,
    details: Array.isArray(inspected) ? inspected[0] ?? null : inspected,
    message: `Inspected ${container}.`,
  };
}

async function logs(args) {
  const container = safeValue(args, "container", { required: true });
  const tail = integerArg(args, "tail", 200, 1, 1000);
  const timestamps = booleanArg(args, "timestamps", false);
  const since = safeValue(args, "since", { maximum: 64 });
  const dockerArgs = ["container", "logs", "--tail", String(tail)];
  if (timestamps) dockerArgs.push("--timestamps");
  if (since) dockerArgs.push("--since", since);
  dockerArgs.push(container);
  const { stdout, stderr } = await runDocker(dockerArgs, { timeout: 30_000 });
  return {
    container,
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    message: `Read the last ${tail} log lines from ${container}.`,
  };
}

async function lifecycle(action, args) {
  const container = safeValue(args, "container", { required: true });
  const dockerArgs = ["container", action];
  if (action !== "start") {
    const timeout = integerArg(args, "timeout", null, 0, 300);
    if (timeout !== null) dockerArgs.push("--timeout", String(timeout));
  }
  dockerArgs.push(container);
  const { stdout } = await runDocker(dockerArgs, { timeout: 60_000 });
  const pastTense = { start: "Started", stop: "Stopped", restart: "Restarted" }[action];
  return {
    container,
    action,
    output: stdout.trim(),
    message: `${pastTense} ${container}.`,
  };
}

async function pullImage(args) {
  const image = safeValue(args, "image", { required: true, maximum: 512 });
  const { stdout } = await runDocker(["image", "pull", image], { timeout: 5 * 60_000 });
  return {
    image,
    output: stdout.trim(),
    message: `Pulled ${image}.`,
  };
}

async function removeImage(args) {
  const image = safeValue(args, "image", { required: true, maximum: 512 });
  const force = booleanArg(args, "force", false);
  const dockerArgs = ["image", "rm"];
  if (force) dockerArgs.push("--force");
  dockerArgs.push(image);
  const { stdout } = await runDocker(dockerArgs, { timeout: 60_000 });
  return {
    image,
    output: stdout.trim(),
    message: `Removed ${image}.`,
  };
}

async function invoke(name, rawArgs) {
  const args = isObject(rawArgs) ? rawArgs : {};
  switch (name) {
    case "docker.status": return status();
    case "docker.containers": return containers(args);
    case "docker.images": return images(args);
    case "docker.inspect": return inspect(args);
    case "docker.logs": return logs(args);
    case "docker.start": return lifecycle("start", args);
    case "docker.stop": return lifecycle("stop", args);
    case "docker.restart": return lifecycle("restart", args);
    case "docker.pull": return pullImage(args);
    case "docker.remove_image": return removeImage(args);
    default: throw new Error(`unknown command ${name}`);
  }
}

function startProtocol() {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const input = readline.createInterface({ input: process.stdin });

  input.on("line", async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          name: PLUGIN_NAME,
          version: PLUGIN_VERSION,
          protocolVersion: PROTOCOL_VERSION,
          description: "Inspect Docker and manage containers and images.",
          commands: COMMANDS,
          events: [],
        },
      });
      return;
    }

    if (message.method === "command/invoke") {
      try {
        const result = await invoke(message.params?.name, message.params?.args);
        send({ jsonrpc: "2.0", id: message.id, result });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: String(error?.message ?? error) },
        });
      }
    }
  });

  input.on("close", () => process.exit(0));
}

if (require.main === module) startProtocol();

module.exports = { COMMANDS, dockerExecutable, invoke, startProtocol };
