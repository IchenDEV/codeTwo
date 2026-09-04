/**
 * The renderer's only import boundary to the desktop container.
 *
 * Product content imports native capabilities from here. Electrobun RPC, native context menus,
 * embedded webviews, windows, dialogs, updates, and pets stay behind this module so the content
 * tree does not depend on a particular desktop shell.
 */
import {
  desktopPerformTitlebarDoubleClick as performTitlebarDoubleClick,
  isElectrobun as desktopContainerAvailable,
} from "./electrobun/client";
import { installTitlebarDoubleClick } from "./electrobun/titlebar";

export function installDesktopTitlebarDoubleClick(
  document: Document,
  onError: (error: unknown) => void
): () => void {
  if (!desktopContainerAvailable) {
    return () => {};
  }
  return installTitlebarDoubleClick(document, () => {
    void performTitlebarDoubleClick().catch(onError);
  });
}

export {
  desktopAppshotSettings,
  desktopCall,
  desktopCaptureAppshot,
  desktopCheckForUpdates,
  desktopConfirm,
  desktopGetAppshot,
  desktopGetPetState,
  desktopHidePet,
  desktopOpenAppshotPrivacySettings,
  desktopOpenDevtools,
  desktopOpenDialog,
  desktopOpenExternal,
  desktopOpenPath,
  desktopOpenWorkspace,
  desktopRequestAppshotPermissions,
  desktopSaveDialog,
  desktopSetSystemBadgeCount,
  desktopShowItemInFolder,
  desktopSystemProfileAvatar,
  desktopUpdateAppshotSettings,
  desktopUpdatePetState,
  desktopUpdateStatus,
  isElectrobun,
  listenDesktop,
  onDesktopAppshotCaptured,
  onDesktopAppshotFailed,
} from "./electrobun/client";
export {
  nativeContextMenusAvailable,
  showNativeContextMenu,
} from "./electrobun/contextMenu";
export type {
  AppshotCapture,
  AppshotDestination,
  AppshotHotkey,
  AppshotSettings,
  AppUpdateStatus,
  DesktopPetState,
  NativeContextMenuItem,
  WorkspaceOpenTarget,
} from "./electrobun/rpc";
export {
  browserAnnotateLocal,
  browserAnnotationCountLocal,
  browserAnnotationsClearLocal,
  browserAnnotationsLocal,
  browserBoundsLocal,
  browserCloseAllLocal,
  browserCloseLocal,
  browserDevtoolsLocal,
  browserHistoryLocal,
  browserNavigateLocal,
  browserOpenLocal,
  browserRegistryCreateLocal,
  browserRegistrySnapshotLocal,
  browserReloadLocal,
  browserSubscribe,
  browserTakeControlLocal,
  browserVisibleLocal,
  browserZoomLocal,
  embeddedBrowserRenderer,
  registerBrowserWebview,
} from "./browser/electrobun";
export type { EmbeddedBrowserTab } from "./browser/electrobun";
