import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { extname, isAbsolute, join } from "node:path";

const maxAvatarBytes = 8 * 1024 * 1024;

async function commandText(command: string[]): Promise<string | null> {
  try {
    const child = Bun.spawn(command, { stderr: "ignore", stdout: "pipe" });
    const [output, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return exitCode === 0 ? output.trim() || null : null;
  } catch {
    return null;
  }
}

function dataUrl(bytes: Uint8Array, mimeType: string): string | null {
  if (bytes.length === 0 || bytes.length > maxAvatarBytes) {
    return null;
  }
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function jpegPhotoDataUrl(output: string | null): string | null {
  const match = output?.match(/(?:^|\n)JPEGPhoto:\s*([\s\S]+)$/u);
  const hex = match?.[1].replaceAll(/\s+/gu, "") ?? "";
  if (
    hex.length === 0 ||
    hex.length % 2 !== 0 ||
    hex.length > maxAvatarBytes * 2 ||
    !/^[0-9a-f]+$/iu.test(hex) ||
    !hex.toLowerCase().startsWith("ffd8ff")
  ) {
    return null;
  }
  return dataUrl(Buffer.from(hex, "hex"), "image/jpeg");
}

function picturePath(output: string | null): string | null {
  const path = output?.match(/(?:^|\n)Picture:\s*(.+)$/mu)?.[1].trim() ?? "";
  return path && isAbsolute(path) ? path : null;
}

async function fileDataUrl(
  path: string,
  mimeType: string
): Promise<string | null> {
  try {
    if ((await stat(path)).size > maxAvatarBytes) {
      return null;
    }
    return dataUrl(await readFile(path), mimeType);
  } catch {
    return null;
  }
}

async function pictureDataUrl(path: string): Promise<string | null> {
  const mimeType = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[extname(path).toLowerCase()];
  if (mimeType != null && mimeType !== "") {
    return await fileDataUrl(path, mimeType);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "codetwo-avatar-"));
  const convertedPath = join(temporaryDirectory, "avatar.png");
  try {
    const child = Bun.spawn(
      ["/usr/bin/sips", "-s", "format", "png", path, "--out", convertedPath],
      { stderr: "ignore", stdout: "ignore" }
    );
    if ((await child.exited) !== 0) {
      return null;
    }
    return fileDataUrl(convertedPath, "image/png");
  } catch {
    return null;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

export async function readSystemProfileAvatar(): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }
  const record = `/Users/${userInfo().username}`;
  const jpegPhoto = jpegPhotoDataUrl(
    await commandText(["/usr/bin/dscl", ".", "-read", record, "JPEGPhoto"])
  );
  if (jpegPhoto != null && jpegPhoto !== "") {
    return jpegPhoto;
  }

  const path = picturePath(
    await commandText(["/usr/bin/dscl", ".", "-read", record, "Picture"])
  );
  return path != null && path !== "" ? await pictureDataUrl(path) : null;
}
