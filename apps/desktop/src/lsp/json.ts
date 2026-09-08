/**
 * LSP-facing re-export of shared JSON narrowing helpers.
 */
export {
  arrayField,
  asJsonArray,
  asJsonObject,
  booleanField,
  isJsonObject,
  numberField,
  objectField,
  parseJsonPayload,
  stringField,
} from "../lib/jsonValue";
export type { JsonObject } from "../lib/jsonValue";
