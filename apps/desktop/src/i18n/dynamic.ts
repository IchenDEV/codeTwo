/**
 * Dynamic i18n keys composed from finite enum fragments at call sites.
 * Static keys should keep using `t("literal")` for StringKey checking.
 */
import type { StringKey } from "./strings";

type TranslateFn = (
  key: StringKey,
  vars?: Record<string, string | number>
) => string;

export function td(
  t: TranslateFn,
  key: string,
  vars?: Record<string, string | number>
): string {
  return t(key as StringKey, vars);
}
