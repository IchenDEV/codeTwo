import type { DocBlock } from "../bridge";
import { isAgentImagePath } from "../files/imageTypes";

/** Lower one visible `@file` mention to the provider-neutral document shape. */
export function workspaceReferenceBlock(path: string): DocBlock {
  return isAgentImagePath(path)
    ? { type: "image", path }
    : { type: "file", path };
}
