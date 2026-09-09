import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getScene } from "../bridge";
import { useT } from "../i18n";
import type { SceneDocument, SceneInfo } from "./scene";

export function ScenePreview({ scene }: { scene: SceneInfo }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [document, setDocument] = useState<SceneDocument | null>(null);
  const [loading, setLoading] = useState(false);
  async function show() {
    setOpen(true);
    setDocument(null);
    setLoading(true);
    try {
      setDocument((await getScene(scene.reference))?.scene ?? null);
    } catch {
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => void show()}>
        {t("sceneEditor.preview")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-dialog-max overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{scene.title}</DialogTitle>
          </DialogHeader>
          <p className="text-body text-muted-foreground">{scene.description}</p>
          {loading ? (
            <p role="status">{t("sceneEditor.loading")}</p>
          ) : document ? (
            <pre className="text-body rounded-control bg-fill-rest p-3 break-words whitespace-pre-wrap">
              {JSON.stringify(document, null, 2)}
            </pre>
          ) : (
            <p role="alert">{t("sceneEditor.loadError")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
