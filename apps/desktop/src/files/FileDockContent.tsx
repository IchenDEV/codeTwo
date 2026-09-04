import { Button } from "@/components/ui/button";
import { FileText, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import { useT } from "../i18n";
import { dirtyKey, useDirtyPaths } from "./dirty";
import { FilePanel } from "./FilePanel";
import { FileViewer } from "./FileViewer";
import type { FileRevealTarget } from "./FileViewer";

type FileDockContentProps = {
  readonly cwd: string | null;
  readonly openFiles: string[];
  readonly activeFile: string | null;
  readonly reveal: FileRevealTarget | null;
  readonly highlightFile?: string | null;
  readonly onActiveFile: (path: string) => void;
  readonly onCloseFile: (path: string) => void;
  readonly onInsertFile: (path: string) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onSendText: (text: string) => void;
};

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
            const isActive = path === activeFile;
            return (
              <Button
                key={path}
                type="button"
                variant="selectable"
                size="row"
                focusStyle="inset"
                data-selected={isActive ? "true" : "false"}
                onClick={() => onActiveFile(path)}
                title={path}
                className={cn(
                  "group px-module-inset text-metadata relative h-full max-w-48 shrink-0 gap-1.5",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{name}</span>
                {cwd != null &&
                cwd !== "" &&
                dirtyPaths.has(dirtyKey(cwd, path)) ? (
                  <span className="bg-warning size-1.5 shrink-0 rounded-full" />
                ) : null}
                <X
                  className="hover:text-destructive size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseFile(path);
                  }}
                />
                {isActive ? (
                  <span className="bg-primary absolute inset-x-1.5 -bottom-px h-0.5 rounded-none" />
                ) : null}
              </Button>
            );
          })}
        </div>

        {activeFile != null &&
        activeFile !== "" &&
        cwd != null &&
        cwd !== "" ? (
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
            <p className="text-metadata text-muted-foreground text-center">
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
