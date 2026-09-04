import { useEffect, useState } from "react";

import { Folder } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import { getProjectIcon, type Project, type ProjectIconData } from "../bridge";

const iconRequests = new Map<string, Promise<ProjectIconData | null>>();

function loadIcon(project: Project): Promise<ProjectIconData | null> {
  const key = `${project.path}:${project.icon_updated_at ?? 0}`;
  let request = iconRequests.get(key);
  if (!request) {
    request = getProjectIcon(project.path).catch(() => null);
    iconRequests.set(key, request);
    if (iconRequests.size > 64)
      iconRequests.delete(iconRequests.keys().next().value!);
  }
  return request;
}

/** Project identity used in settings and the sidebar; custom pixels fall back to the folder mark. */
export function ProjectIcon({
  project,
  size = 20,
  className,
}: {
  project: Project;
  size?: number;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (!project.has_icon) return () => {};

    void loadIcon(project).then((icon) => {
      if (!active || !icon) return;
      objectUrl = URL.createObjectURL(
        new Blob([icon.bytes.slice().buffer as ArrayBuffer], {
          type: icon.mime_type,
        })
      );
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project.path, project.has_icon, project.icon_updated_at]);

  return (
    <span
      data-project-icon
      aria-hidden="true"
      className={cn(
        "rounded-control bg-foreground/[0.055] text-muted-foreground ring-foreground/10 flex shrink-0 items-center justify-center overflow-hidden ring-1",
        className
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Folder style={{ width: size * 0.52, height: size * 0.52 }} />
      )}
    </span>
  );
}
