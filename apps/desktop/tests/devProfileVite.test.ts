import { expect, test } from "bun:test";
import { join } from "node:path";

(process.env.CODETWO_TEST_VITE === "1" ? test : test.skip)(
  "Vite profile servers use strict independent ports",
  async () => {
    const children: ReturnType<typeof Bun.spawn>[] = [];
    const desktop = join(import.meta.dir, "..");
    const allocate = () => {
      const reservation = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response("reserved"),
      });
      const port = reservation.port!;
      reservation.stop(true);
      return port;
    };
    const start = (profile: string, port: number) => {
      const child = Bun.spawn(
        [
          process.execPath,
          "node_modules/vite/bin/vite.js",
          "--host",
          "127.0.0.1",
        ],
        {
          cwd: desktop,
          env: {
            ...process.env,
            CODETWO_DEV_PROFILE: profile,
            CODETWO_DEV_PORT: String(port),
            CODETWO_CHANNEL: "dev",
          },
          stdout: "ignore",
          stderr: "pipe",
        }
      );
      children.push(child);
      return child;
    };
    const ready = async (port: number) => {
      for (let i = 0; i < 100; i++) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`);
          if (response.ok) return await response.text();
        } catch {
          /* Server starting. */
        }
        await Bun.sleep(100);
      }
      throw new Error(`Vite did not listen on ${port}`);
    };
    try {
      const a = allocate();
      const b = allocate();
      const first = start("vite-check-a", a);
      const second = start("vite-check-b", b);
      const pages = await Promise.all([ready(a), ready(b)]);
      for (const page of pages) expect(page).toContain("/@vite/client");
      const collision = start("vite-check-c", a);
      expect(await collision.exited).not.toBe(0);
      expect(await new Response(collision.stderr).text()).toContain(
        `Port ${a} is already in use`
      );
      second.kill("SIGTERM");
      await second.exited;
      expect(first.exitCode).toBeNull();
      expect(await ready(a)).toContain("/@vite/client");
    } finally {
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGTERM");
      await Promise.all(children.map((child) => child.exited));
    }
  },
  30000
);
