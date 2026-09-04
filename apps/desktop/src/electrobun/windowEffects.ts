import { join } from "node:path";
import { dlopen, FFIType } from "bun:ffi";
import type { Pointer } from "bun:ffi";

const libraryName = "libCodeTwoWindowEffects.dylib";

let windowEffects:
  | ReturnType<
      typeof dlopen<{
        codetwoConfigureWindowEffects: {
          args: readonly [typeof FFIType.ptr];
          returns: typeof FFIType.u32;
        };
        codetwoSetDockBadgeCount: {
          args: readonly [typeof FFIType.u32];
          returns: typeof FFIType.u32;
        };
        codetwoPerformTitlebarDoubleClick: {
          args: readonly [typeof FFIType.ptr];
          returns: typeof FFIType.u32;
        };
      }>
    >
  | undefined;

export interface MacOSWindowEffectsStatus {
  backdrop: boolean;
  shadow: boolean;
}

const unavailableStatus: MacOSWindowEffectsStatus = {
  backdrop: false,
  shadow: false,
};

function library() {
  windowEffects ??= dlopen(join(process.cwd(), libraryName), {
    codetwoConfigureWindowEffects: {
      args: [FFIType.ptr],
      returns: FFIType.u32,
    },
    codetwoSetDockBadgeCount: {
      args: [FFIType.u32],
      returns: FFIType.u32,
    },
    codetwoPerformTitlebarDoubleClick: {
      args: [FFIType.ptr],
      returns: FFIType.u32,
    },
  });
  return windowEffects;
}

export function configureMacOSWindowEffects(
  windowPointer: Pointer
): MacOSWindowEffectsStatus {
  if (process.platform !== "darwin") {
    return unavailableStatus;
  }

  try {
    const configuredEffects =
      library().symbols.codetwoConfigureWindowEffects(windowPointer);
    return {
      shadow: (configuredEffects & 1) !== 0,
      backdrop: (configuredEffects & 2) !== 0,
    };
  } catch (error) {
    console.warn("Could not configure the macOS window effects", error);
    return unavailableStatus;
  }
}

export function setMacOSSystemBadgeCount(count: number): boolean {
  if (process.platform !== "darwin") {
    return false;
  }

  try {
    const normalized = Number.isFinite(count)
      ? Math.min(Math.max(Math.trunc(count), 0), 0xff_ff_ff_ff)
      : 0;
    return library().symbols.codetwoSetDockBadgeCount(normalized) !== 0;
  } catch (error) {
    console.warn("Could not update the macOS system badge", error);
    return false;
  }
}

export function performMacOSTitlebarDoubleClick(
  windowPointer: Pointer
): boolean {
  if (process.platform !== "darwin") {
    return false;
  }

  try {
    return (
      library().symbols.codetwoPerformTitlebarDoubleClick(windowPointer) !== 0
    );
  } catch (error) {
    console.warn(
      "Could not perform the macOS titlebar double-click action",
      error
    );
    return false;
  }
}
