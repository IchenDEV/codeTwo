export interface IdentifiedCommand {
  id: string;
  identity?: string;
}

/** Prefer the richer async row for the same entity without duplicating unrelated commands. */
export function mergeCommandResults<T extends IdentifiedCommand>(base: T[], matches: T[]): T[] {
  const matchIdentities = new Set(
    matches.flatMap((command) => (command.identity ? [command.identity] : [])),
  );
  const remaining = base.filter(
    (command) => !command.identity || !matchIdentities.has(command.identity),
  );
  const ids = new Set(remaining.map((command) => command.id));
  return [...remaining, ...matches.filter((command) => !ids.has(command.id))];
}

interface SessionSearchRankable {
  session_id: string;
  archived: boolean;
}

/** Keep backend relevance stable except for the two product-level navigation priorities. */
export function currentFirstSessionHits<T extends SessionSearchRankable>(
  hits: readonly T[],
  currentSession: string | null,
): T[] {
  return [...hits].sort((left, right) => {
    const leftCurrent = left.session_id === currentSession;
    const rightCurrent = right.session_id === currentSession;
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
    if (left.archived !== right.archived) return left.archived ? 1 : -1;
    return 0;
  });
}
