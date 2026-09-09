import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AtSign } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { listFiles } from "../bridge";
import { useT } from "../i18n";

// File browser: search the workspace and drop a file into the prompt as an `@` mention.
export function FileBrowserModal({
  loadFiles = listFiles,
  cwd,
  onInsert,
  onClose,
}: {
  loadFiles?: typeof listFiles;
  cwd: string;
  onInsert: (path: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void loadFiles(cwd, q, 300)
        .then((files) => {
          if (active)
            setAll(
              files.filter(
                (path) =>
                  ![".DS_Store", "Thumbs.db"].includes(
                    path.split("/").at(-1) ?? ""
                  )
              )
            );
        })
        .catch((cause: unknown) => {
          if (active) setError(String(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cwd, q, loadFiles]);
  const filtered = loading ? [] : all;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("files.referenceTitle")}</DialogTitle>
          <p className="text-body text-muted-foreground">
            {t("files.referenceHint")}
          </p>
        </DialogHeader>

        <Input
          placeholder={t("files.filter")}
          aria-label={t("files.referenceTitle")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {loading && (
          <p className="text-metadata text-muted-foreground">
            {t("files.searching")}
          </p>
        )}

        {error != null && (
          <p role="alert" className="text-body text-destructive">
            {error}
          </p>
        )}
        <p className="text-metadata text-muted-foreground">
          {t("files.referenceLimit")}
        </p>
        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="space-y-0.5">
            {filtered.map((p) => (
              <Button
                key={p}
                type="button"
                variant="ghost"
                size="row"
                focusStyle="inset"
                onClick={() => onInsert(p)}
                title={t("files.referenceTitle")}
                className="px-module-inset text-metadata w-full justify-between py-1.5 font-mono"
              >
                <span className="truncate">{p}</span>
                <AtSign className="text-primary size-3.5 shrink-0" />
              </Button>
            ))}
            {!loading && error == null && filtered.length === 0 && (
              <p className="text-body text-muted-foreground p-2">
                {t("files.empty")}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("sceneEditor.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
