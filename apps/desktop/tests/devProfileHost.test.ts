import { expect, test } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  statSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NativeHost } from "../src/electrobun/nativeHost";

const executable = process.env.CODETWO_TEST_HOST_BINARY;
(executable ? test : test.skip)(
  "real Core processes isolate sessions, socket ownership, stop and crash recovery",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "c2-host-isolation-"));
    const script = join(root, "provider.cjs");
    writeFileSync(
      script,
      String.raw`
const fs = require('node:fs');
const rl = require('node:readline').createInterface({input: process.stdin});
fs.writeFileSync(process.argv[2], String(process.pid));
const send = o => process.stdout.write(JSON.stringify(o) + '\n');
rl.on('line', line => {
 const m = JSON.parse(line);
 if (m.method === 'initialize') send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{}}});
 else if (m.method === 'session/new') send({jsonrpc:'2.0',id:m.id,result:{sessionId:'stub-session'}});
 else if (m.method === 'session/prompt') send({jsonrpc:'2.0',id:900,method:'session/request_permission',params:{sessionId:'stub-session',toolCall:{toolCallId:'tool',title:'isolated permission',kind:'execute'},options:[{optionId:'allow',name:'Allow',kind:'allow_once'},{optionId:'reject',name:'Reject',kind:'reject_once'}]}});
});
`
    );
    const events = new Map<
      NativeHost,
      Array<{ name: string; payload: unknown }>
    >();
    const hosts: NativeHost[] = [];
    const children: ReturnType<typeof Bun.spawn>[] = [];
    const make = (name: string, socket = name) => {
      const data = join(root, name);
      mkdirSync(data, { recursive: true });
      const settings = join(data, "provider-settings.json");
      if (!existsSync(settings))
        writeFileSync(
          settings,
          JSON.stringify({
            schema_version: 1,
            runtime: {
              opencode: {
                command: process.execPath,
                args: [script, join(root, `${name}.provider.pid`)],
              },
            },
          })
        );
      const host = new NativeHost({
        executable: executable!,
        dataDir: join(root, name),
        onEvent: (event) => events.get(host)?.push(event),
        spawn: (command) => {
          // Reproduce the packaged Bun runtime's inherited nonblocking stdin before exec.
          const launch =
            name === "a" && process.platform !== "win32"
              ? [
                  "python3",
                  "-c",
                  "import os,sys; os.set_blocking(0,False); os.execv(sys.argv[1],sys.argv[1:])",
                  ...command,
                ]
              : command;
          const child = Bun.spawn(launch, {
            // Each production profile is launched in its own CLI process group.
            detached: true,
            env: {
              ...process.env,
              CODETWO_SCENE_SOCKET: join(root, `${socket}.sock`),
            },
            stdin: "pipe",
            stdout: "pipe",
            stderr: "ignore",
          });
          children.push(child);
          return child;
        },
      });
      events.set(host, []);
      hosts.push(host);
      return host;
    };
    const sessions = (host: NativeHost) =>
      host.call("sessions.list", {}, null) as Promise<
        Array<{
          id: string;
          activity: { state: { kind: string; reason?: string } };
        }>
      >;
    try {
      const a = make("a");
      const b = make("b");
      await Promise.all([a.start(), b.start()]);
      await a.call(
        "engine.new_session",
        { provider: "opencode", cwd: root, use_worktree: false },
        null
      );
      const created = await sessions(a);
      await a.call(
        "engine.prompt",
        {
          session: created[0]!.id,
          doc: [{ type: "text", text: "wait for permission" }],
        },
        null
      );
      const waitForPermission = async (host: NativeHost) => {
        for (let attempt = 0; attempt < 200; attempt++) {
          const current = await sessions(host);
          if (current[0]?.activity.state.kind === "awaiting_input")
            return current;
          await Bun.sleep(50);
        }
        throw new Error(
          `No permission request: ${JSON.stringify(events.get(host))}`
        );
      };
      const original = await waitForPermission(a);
      expect(original).toHaveLength(1);
      expect(await sessions(b)).toHaveLength(0);
      expect(statSync(join(root, "a", "codetwo.db")).ino).not.toBe(
        statSync(join(root, "b", "codetwo.db")).ino
      );
      const socketInode = statSync(join(root, "a.sock")).ino;
      await expect(make("a").start()).rejects.toThrow();
      await expect(make("c", "a").start()).rejects.toThrow();
      expect(statSync(join(root, "a.sock")).ino).toBe(socketInode);
      expect(await sessions(a)).toEqual(original);
      expect(JSON.stringify(events.get(b))).not.toContain(created[0]!.id);
      await b.call(
        "engine.new_session",
        { provider: "opencode", cwd: root },
        null
      );
      const bCreated = await sessions(b);
      await b.call(
        "engine.prompt",
        {
          session: bCreated[0]!.id,
          doc: [{ type: "text", text: "B permission" }],
        },
        null
      );
      await waitForPermission(b);
      const aPid = Number(readFileSync(join(root, "a.provider.pid"), "utf8"));
      const bPid = Number(readFileSync(join(root, "b.provider.pid"), "utf8"));
      expect(aPid).not.toBe(bPid);
      const processGroup = (pid: number) =>
        Bun.spawnSync(["ps", "-p", String(pid), "-o", "pgid="], {
          stdout: "pipe",
        })
          .stdout.toString()
          .trim();
      expect(processGroup(aPid)).not.toBe(processGroup(bPid));
      await b.shutdown();
      expect(await sessions(a)).toEqual(original);
      const b2 = make("b");
      await b2.start();
      expect(await sessions(b2)).toHaveLength(1);
      // Kill only the disposable A child, then prove the OS lock and stale socket are recoverable.
      children[0]!.kill("SIGKILL");
      await children[0]!.exited;
      const a2 = make("a");
      await a2.start();
      expect((await sessions(a2)).map((session) => session.id)).toEqual(
        original.map((session) => session.id)
      );
      expect((await sessions(a2))[0]!.activity.state.reason).toBe(
        "interrupted"
      );
      expect(await sessions(b2)).toHaveLength(1);
    } finally {
      await Promise.allSettled(hosts.map((host) => host.shutdown()));
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGKILL");
      await Promise.allSettled(children.map((child) => child.exited));
      rmSync(root, { recursive: true, force: true });
    }
  },
  60000
);

(executable && process.platform !== "win32" ? test : test.skip)(
  "stdio survives late nonblocking flags and a split UTF-8 request",
  async () => {
    const probe = Bun.spawn(
      [
        "python3",
        "-c",
        String.raw`
import os,sys,json,subprocess,tempfile,time
with tempfile.TemporaryDirectory(prefix='c2-late-pipe-') as root:
    r,w=os.pipe()
    child=subprocess.Popen([sys.argv[1],'--data-dir',root],stdin=r,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={**os.environ,'CODETWO_SCENE_SOCKET':root+'/scene.sock'})
    try:
        while True:
            line=child.stdout.readline()
            assert line, 'host exited before ready'
            if b'host-ready' in line: break
        os.set_blocking(r,False)
        request=json.dumps({'id':71,'method':'ping','params':'中文'},ensure_ascii=False).encode()+b'\n'
        split=request.index('中'.encode())+1
        os.write(w,request[:split])
        time.sleep(.1)
        os.write(w,request[split:])
        while True:
            line=child.stdout.readline()
            assert line, 'host exited on a late nonblocking or partial input'
            response=json.loads(line)
            if response.get('id')==71:
                assert response.get('result')=='pong', response
                break
        os.write(w,b'{"id":72,"method":"shutdown"}\n')
        child.communicate(timeout=10)
        assert child.returncode==0
    finally:
        os.close(r);os.close(w)
        if child.poll() is None: child.kill()
        child.wait()
`,
        executable!,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const [status, error] = await Promise.all([
      probe.exited,
      new Response(probe.stderr).text(),
    ]);
    expect(error).toBe("");
    expect(status).toBe(0);
  },
  30000
);
