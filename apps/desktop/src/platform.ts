export type DesktopPlatform = "macos" | "windows" | "linux";

export function desktopPlatform(identity: string): DesktopPlatform {
  if (/windows|win32|win64/iu.test(identity)) {
    return "windows";
  }
  if (/macintosh|macintel|mac os|iphone|ipad/iu.test(identity)) {
    return "macos";
  }
  return "linux";
}

export function currentDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "linux";
  }
  return desktopPlatform(
    `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`
  );
}
