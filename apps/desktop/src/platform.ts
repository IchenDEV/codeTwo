export type DesktopPlatform = "macos" | "windows" | "linux";

/** Detect the host family from browser-exposed platform strings. */
export function desktopPlatform(identity: string): DesktopPlatform {
  if (/windows|win32|win64/i.test(identity)) return "windows";
  if (/macintosh|macintel|mac os|iphone|ipad/i.test(identity)) return "macos";
  return "linux";
}

export function currentDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "linux";
  return desktopPlatform(
    `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`
  );
}
