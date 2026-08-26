const assert = require("node:assert/strict");
const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");
const readline = require("node:readline");

const PLUGIN = join(__dirname, "plugin.js");

function fakeDocker(root) {
  const executable = join(root, "docker-fixture");
  writeFileSync(executable, `#!/usr/bin/env node
const args = process.argv.slice(2);
const key = args.slice(0, 2).join(" ");
if (key === "info --format") {
  process.stdout.write(JSON.stringify({
    ClientInfo: { Version: "29.0.0", Context: "fixture" },
    ServerVersion: "28.0.0", Name: "fixture-engine", OperatingSystem: "Linux",
    Architecture: "aarch64", NCPU: 8, MemTotal: 4096, DockerRootDir: "/var/lib/docker",
    Containers: 3, ContainersRunning: 1, ContainersPaused: 0, ContainersStopped: 2, Images: 4
  }));
} else if (key === "container ls") {
  process.stdout.write(JSON.stringify({ ID: "one", Names: "api", State: "running" }) + "\\n");
  process.stdout.write(JSON.stringify({ ID: "two", Names: "db", State: "exited" }) + "\\n");
} else if (key === "image ls") {
  process.stdout.write(JSON.stringify({ ID: "sha256:one", Repository: "api", Tag: "latest" }) + "\\n");
} else if (key === "container inspect") {
  process.stdout.write(JSON.stringify([{ Id: args[2], State: { Status: "running" } }]));
} else if (key === "container logs") {
  process.stdout.write("application output\\n");
  process.stderr.write("application error\\n");
} else if (["container start", "container stop", "container restart"].includes(key)) {
  process.stdout.write(JSON.stringify(args));
} else if (key === "image pull" || key === "image rm") {
  process.stdout.write(JSON.stringify(args));
} else {
  process.stderr.write("unexpected args: " + JSON.stringify(args));
  process.exitCode = 2;
}
`);
  chmodSync(executable, 0o755);
  return executable;
}

function pluginPeer(dockerCli) {
  const child = spawn(process.execPath, [PLUGIN], {
    env: { ...process.env, C2_DOCKER_CLI: dockerCli },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = readline.createInterface({ input: child.stdout });
  const waiting = [];
  const buffered = [];
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else buffered.push(message);
  });
  const receive = () => buffered.length > 0
    ? Promise.resolve(buffered.shift())
    : new Promise((resolve) => waiting.push(resolve));
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  return {
    child,
    request: async (id, method, params) => {
      send({ jsonrpc: "2.0", id, method, params });
      return receive();
    },
    close: async () => {
      child.stdin.end();
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

test("speaks the C2 protocol and returns structured Docker data", async () => {
  const root = mkdtempSync(join(tmpdir(), "codetwo-docker-plugin-"));
  const peer = pluginPeer(fakeDocker(root));
  try {
    const initialized = await peer.request(1, "initialize", {
      protocolVersion: "1.0.0",
      host: { name: "test", version: "0.0.0", commands: [] },
      config: null,
      dataDir: root,
    });
    assert.equal(initialized.result.name, "docker-tools");
    assert.equal(initialized.result.protocolVersion, "1.0.0");
    assert.deepEqual(
      initialized.result.commands.map((command) => command.name),
      [
        "docker.status", "docker.containers", "docker.images", "docker.inspect",
        "docker.logs", "docker.start", "docker.stop", "docker.restart",
        "docker.pull", "docker.remove_image",
      ],
    );

    const status = await peer.request(2, "command/invoke", {
      name: "docker.status",
      args: {},
    });
    assert.equal(status.result.serverVersion, "28.0.0");
    assert.equal(status.result.containers.running, 1);
    assert.match(status.result.message, /1 running/);

    const containers = await peer.request(3, "command/invoke", {
      name: "docker.containers",
      args: { limit: 1 },
    });
    assert.equal(containers.result.count, 1);
    assert.equal(containers.result.truncated, true);
    assert.equal(containers.result.containers[0].name, "api");

    const images = await peer.request(4, "command/invoke", {
      name: "docker.images",
      args: {},
    });
    assert.equal(images.result.count, 1);
    assert.equal(images.result.images[0].repository, "api");

    const logs = await peer.request(5, "command/invoke", {
      name: "docker.logs",
      args: { container: "api", tail: 25 },
    });
    assert.equal(logs.result.stdout, "application output");
    assert.equal(logs.result.stderr, "application error");

    const stopped = await peer.request(6, "command/invoke", {
      name: "docker.stop",
      args: { container: "api", timeout: 12 },
    });
    assert.deepEqual(JSON.parse(stopped.result.output), ["container", "stop", "--timeout", "12", "api"]);

    const pulled = await peer.request(7, "command/invoke", {
      name: "docker.pull",
      args: { image: "postgres:16-alpine" },
    });
    assert.deepEqual(JSON.parse(pulled.result.output), ["image", "pull", "postgres:16-alpine"]);

    const removed = await peer.request(8, "command/invoke", {
      name: "docker.remove_image",
      args: { image: "sha256:one", force: true },
    });
    assert.deepEqual(JSON.parse(removed.result.output), ["image", "rm", "--force", "sha256:one"]);
  } finally {
    await peer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects option-shaped container names before invoking Docker", async () => {
  const root = mkdtempSync(join(tmpdir(), "codetwo-docker-plugin-"));
  const peer = pluginPeer(fakeDocker(root));
  try {
    const response = await peer.request(1, "command/invoke", {
      name: "docker.stop",
      args: { container: "--all" },
    });
    assert.equal(response.error.code, -32000);
    assert.match(response.error.message, /container is invalid/);
  } finally {
    await peer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects option-shaped image references before invoking Docker", async () => {
  const root = mkdtempSync(join(tmpdir(), "codetwo-docker-plugin-"));
  const peer = pluginPeer(fakeDocker(root));
  try {
    const response = await peer.request(1, "command/invoke", {
      name: "docker.remove_image",
      args: { image: "--all" },
    });
    assert.equal(response.error.code, -32000);
    assert.match(response.error.message, /image is invalid/);
  } finally {
    await peer.close();
    rmSync(root, { recursive: true, force: true });
  }
});
