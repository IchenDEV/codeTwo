import { FileText, X } from "@/components/ui/icons";

import { FilePanel } from "./FilePanel";
import { FileViewer, type FileRevealTarget } from "./FileViewer";
import { dirtyKey, useDirtyPaths } from "./dirty";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileDockContentProps = {
  cwd: string | null;
  openFiles: string[];
  activeFile: string | null;
  reveal: FileRevealTarget | null;
  highlightFile?: string | null;
  onActiveFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onInsertFile: (path: string) => void;
  onOpenFile: (path: string) => void;
  onSendText: (text: string) => void;
};

/** File tabs, viewer, and tree composed as one content module for the generic Dock container. */
export function FileDockContent({
  cwd,
  openFiles,
  activeFile,
  reveal,
  highlightFile,
  onActiveFile,
  onCloseFile,
  onInsertFile,
  onOpenFile,
  onSendText,
}: FileDockContentProps) {
  const t = useT();
  const dirtyPaths = useDirtyPaths();

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="dock-content-tabbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-2">
          {openFiles.map((path) => {
            const name = path.split("/").pop() ?? path;
            const active = path === activeFile;
            return (
              <Button
                key={path}
                type="button"
                variant="selectable"
                size="row"
                focusStyle="inset"
                data-selected={active ? "true" : "false"}
                onClick={() => onActiveFile(path)}
                title={path}
                className={cn(
                  "group relative h-full max-w-48 shrink-0 gap-1.5 px-module-inset text-metadata",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{name}</span>
                {cwd && dirtyPaths.has(dirtyKey(cwd, path)) && (
                  <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                )}
                <X
                  className="size-3 shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseFile(path);
                  }}
                />
                {active && (
                  <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-none bg-primary" />
                )}
              </Button>
            );
          })}
        </div>

        {activeFile && cwd ? (
          <FileViewer
            key={activeFile}
            cwd={cwd}
            path={activeFile}
            onInsert={onInsertFile}
            onOpen={onOpenFile}
            onComment={onSendText}
            reveal={reveal}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-center text-metadata text-muted-foreground">
              {t("files.noneOpen")}
            </p>
          </div>
        )}
      </div>

      <div className="dock-content-split flex w-60 shrink-0 flex-col">
        <FilePanel
          cwd={cwd}
          onInsert={onInsertFile}
          onOpen={onOpenFile}
          openPath={activeFile ?? highlightFile ?? null}
        />
      </div>
    </div>
  );
}
