export interface IdentifiedCommand {
  id: string;
  identity?: string;
}

/** Prefer the richer async row for the same entity without duplicating unrelated commands. */
export function mergeCommandResults<T extends IdentifiedCommand>(
  base: T[],
  matches: T[]
): T[] {
  const matchIdentities = new Set(
    matches.flatMap((command) => (command.identity ? [command.identity] : []))
  );
  const remaining = base.filter(
    (command) => !command.identity || !matchIdentities.has(command.identity)
  );
  const ids = new Set(remaining.map((command) => command.id));
  return [...remaining, ...matches.filter((command) => !ids.has(command.id))];
}
