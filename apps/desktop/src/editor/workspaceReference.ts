import { isAgentImagePath } from "../files/imageTypes";
import type { DocumentBlock as DocumentBlock } from "../bridge";

export function workspaceReferenceBlock(path: string): DocumentBlock {
  return isAgentImagePath(path)
    ? { path, type: "image" }
    : { path, type: "file" };
}
