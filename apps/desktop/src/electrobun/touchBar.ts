import { CString, dlopen, FFIType, JSCallback } from "bun:ffi";
import type { Pointer } from "bun:ffi";
import { join } from "node:path";

import type { HostActionAdapter } from "./pluginHostActions";

const libraryName = "libCodeTwoWindowEffects.dylib";

export function createMacOSTouchBar(
  windowPointer: Pointer,
  onInvoke: (contributionKey: string, itemId: string) => void
): HostActionAdapter | null {
  if (process.platform !== "darwin") return null;

  try {
    const library = dlopen(join(process.cwd(), libraryName), {
      codetwoConfigureTouchBar: {
        args: [FFIType.ptr, FFIType.function],
        returns: FFIType.u32,
      },
      codetwoUpdateTouchBar: {
        args: [FFIType.ptr, FFIType.cstring],
        returns: FFIType.u32,
      },
      codetwoDisposeTouchBar: {
        args: [FFIType.ptr],
        returns: FFIType.void,
      },
    });
    const callback = new JSCallback(
      (contributionPointer, itemPointer) => {
        onInvoke(
          new CString(contributionPointer).toString(),
          new CString(itemPointer).toString()
        );
      },
      {
        args: [FFIType.cstring, FFIType.cstring],
        returns: FFIType.void,
        threadsafe: true,
      }
    );
    if (
      callback.ptr === null ||
      library.symbols.codetwoConfigureTouchBar(windowPointer, callback) === 0
    ) {
      callback.close();
      library.close();
      return null;
    }
    return {
      render(items) {
        const json = Buffer.from(`${JSON.stringify(items)}\0`, "utf-8");
        return library.symbols.codetwoUpdateTouchBar(windowPointer, json) !== 0;
      },
      dispose() {
        library.symbols.codetwoDisposeTouchBar(windowPointer);
        callback.close();
        library.close();
      },
    };
  } catch (error) {
    console.warn("Could not configure the macOS Touch Bar", error);
    return null;
  }
}
