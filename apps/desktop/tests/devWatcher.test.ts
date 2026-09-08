import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";

// Exercise the installed Electrobun watcher itself. Stub only native launch/build so this
// regression never opens a window or performs a Rust/renderer build.
test("runtime output cannot restart the dev watcher, while source edits still rebuild", async () => {
  const desktop = join(import.meta.dir, "..");
  const root = mkdtempSync(join(tmpdir(), "c2-watch-feedback-"));
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const source = readFileSync(
      join(desktop, "node_modules/electrobun/src/cli/index.ts"),
      "utf8"
    );
    const ast = ts.createSourceFile(
      "electrobun.ts",
      source,
      ts.ScriptTarget.Latest,
      true
    );
    let watchSource = "";
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "runDevWatch")
        watchSource = node.getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(watchSource).not.toBe("");
    const implementation = ts.transpileModule(watchSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const resolved = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        'import config from "./electrobun.config.ts"; console.log(JSON.stringify(config))',
      ],
      {
        cwd: desktop,
        env: {
          ...process.env,
          CODETWO_DEV_PROFILE: "watch-probe",
          CODETWO_DEV_PORT: "15431",
          CODETWO_CHANNEL: "dev",
        },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    expect(resolved.exitCode).toBe(0);
    writeFileSync(join(root, "watch.js"), implementation);
    writeFileSync(join(root, "config.json"), resolved.stdout);
    writeFileSync(
      join(root, "probe.ts"),
      String.raw`
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
const root=import.meta.dir;
const projectRoot=join(root,"apps/desktop");
const config=JSON.parse(readFileSync(join(root,"config.json"),"utf8"));
for (const dir of ["src/electrobun","src-host","scripts","../../crates"]) mkdirSync(join(projectRoot,dir),{recursive:true});
for (const file of ["index.html","vite.config.ts","scripts/prepare-electrobun.ts","src/example.ts"]) writeFileSync(join(projectRoot,file),"fixture");
const runtimeRoot=join(root,".codex/run/instances/watch-probe");
mkdirSync(runtimeRoot,{recursive:true});
const log=join(runtimeRoot,"runtime.log");
writeFileSync(log,"");
let builds=0;
const runBuild=async()=>{
 builds++;
 for (const [src,dest] of Object.entries(config.build.copy)) {
  const path=join(projectRoot,src);
  if(dest==="views/main") {mkdirSync(path,{recursive:true});writeFileSync(join(path,"index.html"),"build");}
  else {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,"binary");}
 }
};
const runApp=async()=>{
 let done;
 const exited=new Promise(resolve=>done=resolve);
 const timer=setTimeout(()=>writeFileSync(log,"app output "+builds),100);
 return {kill(){clearTimeout(timer);done(0);},exited};
};
const make=new Function("projectRoot","runBuild","runApp","takeoverForeground","join","dirname","statSync",readFileSync(join(root,"watch.js"),"utf8")+";return runDevWatch;");
void make(projectRoot,runBuild,runApp,async()=>()=>{},join,dirname,statSync)(config).catch(error=>{console.error(error);process.exit(1);});
await Bun.sleep(1700);
const afterRuntimeWrites=builds;
writeFileSync(join(projectRoot,"src/example.ts"),"source changed");
await Bun.sleep(900);
console.log("WATCH_RESULT="+JSON.stringify({afterRuntimeWrites,afterSourceEdit:builds}));
process.emit("SIGINT");
`
    );
    child = Bun.spawn([process.execPath, join(root, "probe.ts")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [status, output, errors] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(errors).toBe("");
    expect(status).toBe(0);
    const result = JSON.parse(
      output.match(/^WATCH_RESULT=(.+)$/m)?.[1] ?? "null"
    );
    expect(result).toEqual({ afterRuntimeWrites: 1, afterSourceEdit: 2 });
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGKILL");
      await child.exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
