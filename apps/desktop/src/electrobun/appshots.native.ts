import { dlopen, FFIType, ptr } from "bun:ffi";
import { join } from "node:path";

const libraryName = "libCodeTwoWindowEffects.dylib";
const resultBufferSize = 1024 * 1024;

type NativeCaptureResult = {
  ok: boolean;
  code?: string;
  message?: string;
  app_name?: string;
  window_title?: string;
  text?: string;
  text_truncated?: boolean;
  width?: number;
  height?: number;
};

let nativeAppshots:
  | ReturnType<
      typeof dlopen<{
        codetwoAppshotPermissionStatus: {
          args: readonly [];
          returns: typeof FFIType.u32;
        };
        codetwoRequestAppshotPermissions: {
          args: readonly [typeof FFIType.u32];
          returns: typeof FFIType.u32;
        };
        codetwoCommandKeyState: {
          args: readonly [];
          returns: typeof FFIType.u32;
        };
        codetwoCaptureAppshot: {
          args: readonly [
            typeof FFIType.cstring,
            typeof FFIType.cstring,
            typeof FFIType.ptr,
            typeof FFIType.u32,
          ];
          returns: typeof FFIType.i32;
        };
      }>
    >
  | null
  | undefined;

function library() {
  if (process.platform !== "darwin") return null;
  if (nativeAppshots !== undefined) return nativeAppshots;
  try {
    nativeAppshots = dlopen(join(process.cwd(), libraryName), {
      codetwoAppshotPermissionStatus: {
        args: [],
        returns: FFIType.u32,
      },
      codetwoRequestAppshotPermissions: {
        args: [FFIType.u32],
        returns: FFIType.u32,
      },
      codetwoCommandKeyState: {
        args: [],
        returns: FFIType.u32,
      },
      codetwoCaptureAppshot: {
        args: [FFIType.cstring, FFIType.cstring, FFIType.ptr, FFIType.u32],
        returns: FFIType.i32,
      },
    });
  } catch (error) {
    console.warn("Could not load macOS Appshot support", error);
    nativeAppshots = null;
  }
  return nativeAppshots;
}

export type MacOSAppshotPermissions = {
  available: boolean;
  screenRecording: boolean;
  accessibility: boolean;
};

function permissionsFromBits(bits: number): MacOSAppshotPermissions {
  return {
    screenRecording: (bits & 1) !== 0,
    accessibility: (bits & 2) !== 0,
    available: (bits & 4) !== 0,
  };
}

export function macOSAppshotPermissions(): MacOSAppshotPermissions {
  const loaded = library();
  return loaded
    ? permissionsFromBits(loaded.symbols.codetwoAppshotPermissionStatus())
    : { available: false, screenRecording: false, accessibility: false };
}

export function requestMacOSAppshotPermissions(
  kind: "screen-recording" | "accessibility",
): MacOSAppshotPermissions {
  const loaded = library();
  const requestedPermissions = kind === "screen-recording" ? 1 : 2;
  return loaded
    ? permissionsFromBits(loaded.symbols.codetwoRequestAppshotPermissions(requestedPermissions))
    : { available: false, screenRecording: false, accessibility: false };
}

export function macOSCommandKeyState(): number {
  return library()?.symbols.codetwoCommandKeyState() ?? 0;
}

export function captureMacOSAppshot(
  outputPath: string,
  excludedBundleIdentifier: string,
): NativeCaptureResult {
  const loaded = library();
  if (!loaded) {
    return {
      ok: false,
      code: "unsupported",
      message: "Appshots are available on macOS only.",
    };
  }

  const buffer = new Uint8Array(resultBufferSize);
  const output = new TextEncoder().encode(`${outputPath}\0`);
  const excluded = new TextEncoder().encode(`${excludedBundleIdentifier}\0`);
  const status = loaded.symbols.codetwoCaptureAppshot(
    output,
    excluded,
    ptr(buffer),
    buffer.byteLength,
  );
  const length = buffer.indexOf(0);
  const json = Buffer.from(buffer.subarray(0, length >= 0 ? length : buffer.length)).toString("utf8");
  try {
    return JSON.parse(json) as NativeCaptureResult;
  } catch {
    return {
      ok: false,
      code: "native_failure",
      message: status === 0 ? "The Appshot helper returned an unreadable result." : `Appshot capture failed (${status}).`,
    };
  }
}
