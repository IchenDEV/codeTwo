import type { DocumentBlock } from "../bridge";
import { isAgentImagePath } from "../files/imageTypes";

export function workspaceReferenceBlock(path: string): DocumentBlock {
  return isAgentImagePath(path)
    ? { path, type: "image" }
    : { path, type: "file" };
}
