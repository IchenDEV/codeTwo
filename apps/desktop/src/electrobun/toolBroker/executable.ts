import { accessSync, constants } from "node:fs";
import { delimiter, extname, join } from "node:path";

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function which(command: string): string | null {
  if (command.includes("/") || command.includes("\\"))
    return executable(command) ? command : null;

  const extensions =
    process.platform === "win32" && !extname(command)
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      if (executable(candidate)) return candidate;
    }
  }
  return null;
}
