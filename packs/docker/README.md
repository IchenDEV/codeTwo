# Docker Tools for C2

Docker Tools is a C2 process bundle for inspecting the local Docker engine and managing containers
and images. It uses the Docker CLI directly and does not execute commands through a shell.

When the enabled bundle is present, C2 adds a dedicated **Docker** page to the primary sidebar. The
page keeps Docker operations on the bundle's `docker.*` command surface: it does not add a second
native IPC path.

## Requirements

- C2 with Plugin Standard 1.2.0 support
- Node.js 18 or newer
- Docker CLI with access to a running Docker engine

On macOS, the plugin checks the standard Docker Desktop and Homebrew locations when the desktop
application's `PATH` does not include `docker`. Set `C2_DOCKER_CLI` before starting C2 to use a
different executable.

## Install

Install the `packs/docker` directory as a plugin bundle, then enable and trust its process runtime
in Plugin Hub. Installation and trust do not execute the plugin; its first `docker.*` command starts
the process.

During development, copy the bundle into C2's installed plugin directory and enable
**Settings → Developer → Developer mode** for automatic reloads.

## Commands

| Command | Result |
| --- | --- |
| `docker.status` | Engine version, context, host resources, and container/image counts |
| `docker.containers` | Structured container list, including stopped containers by default |
| `docker.images` | Structured local image list |
| `docker.inspect` | Docker inspect data for one container |
| `docker.logs` | Up to 1,000 recent log lines from one container |
| `docker.start` | Starts one container |
| `docker.stop` | Stops one container, with an optional bounded timeout |
| `docker.restart` | Restarts one container, with an optional bounded timeout |
| `docker.pull` | Pulls one image by repository, tag, or digest |
| `docker.remove_image` | Removes one local image after host-side confirmation |

The runtime does not expose arbitrary Docker or shell arguments. Container and image identifiers
that begin with `-` are rejected, list sizes and log tails are bounded, and every Docker subprocess
has a timeout.

## Validate

```sh
cd apps/desktop
bun run plugin:validate ../../packs/docker
```
