import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { join } from "node:path";

const libraryName = "libCodeTwoWindowEffects.dylib";

let windowEffects:
  | ReturnType<
      typeof dlopen<{
        codetwoConfigureWindowEffects: {
          args: readonly [typeof FFIType.ptr];
          returns: typeof FFIType.u32;
        };
      }>
    >
  | undefined;

export type MacOSWindowEffectsStatus = {
  backdrop: boolean;
  shadow: boolean;
};

const unavailableStatus: MacOSWindowEffectsStatus = { backdrop: false, shadow: false };

export function configureMacOSWindowEffects(
  windowPointer: Pointer,
): MacOSWindowEffectsStatus {
  if (process.platform !== "darwin") return unavailableStatus;

  try {
    windowEffects ??= dlopen(join(process.cwd(), libraryName), {
      codetwoConfigureWindowEffects: {
        args: [FFIType.ptr],
        returns: FFIType.u32,
      },
    });
    const configuredEffects = windowEffects.symbols.codetwoConfigureWindowEffects(windowPointer);
    return {
      shadow: (configuredEffects & 1) !== 0,
      backdrop: (configuredEffects & 2) !== 0,
    };
  } catch (error) {
    console.warn("Could not configure the macOS window effects", error);
    return unavailableStatus;
  }
}
