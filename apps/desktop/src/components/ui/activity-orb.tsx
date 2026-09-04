import { memo, type CSSProperties, type ComponentProps } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

import { cn } from "@/lib/utils";

type ThinkingOrbProps = ComponentProps<typeof ThinkingOrb>;

export interface ActivityOrbProps extends Omit<
  ThinkingOrbProps,
  "size" | "state" | "style"
> {
  readonly state: OrbState;
  /** C2's 14px loading contract, the native 20px inline preset, or the 64px avatar preset. */
  readonly visualSize?: 14 | 20 | 64;
  readonly style?: CSSProperties;
}

/**
 * The single animated activity primitive for product surfaces.
 *
 * thinking-orbs has separately tuned 20px and 64px drawings. C2's compact controls need a 14px
 * loading mark, so that case keeps the detailed 20px preset and only changes its CSS footprint.
 */
export const ActivityOrb = memo(function ActivityOrb({
  state,
  visualSize = 20,
  className,
  style,
  ...props
}: ActivityOrbProps) {
  const presetSize = visualSize === 64 ? 64 : 20;

  return (
    <ThinkingOrb
      {...props}
      data-activity-orb=""
      data-activity-state={state}
      state={state}
      size={presetSize}
      className={cn("shrink-0", className)}
      style={{ width: visualSize, height: visualSize, ...style }}
    />
  );
});
