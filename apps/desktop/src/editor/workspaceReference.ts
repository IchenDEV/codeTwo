import { isAgentImagePath } from "../files/imageTypes";
import type { DocBlock as DocumentBlock } from "../bridge";

/**
Lower one visible `@file` mention to the provider-neutral document shape.
*/
export function workspaceReferenceBlock(path: string): DocumentBlock {
  return isAgentImagePath(path)
    ? { type: "image", path }
    : { type: "file", path };
}
