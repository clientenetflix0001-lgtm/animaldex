export type CommentOrderRow = {
  id: string;
  createdAt: number;
};

export const COMMENT_ORDER_SQL = 'ORDER BY c.created_at DESC, c.id DESC';

export function compareCommentsNewestFirst(a: CommentOrderRow, b: CommentOrderRow): number {
  if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
  if (b.id === a.id) return 0;
  return b.id > a.id ? 1 : -1;
}

export function sortCommentsNewestFirst<T extends CommentOrderRow>(rows: T[]): T[] {
  return rows.slice().sort(compareCommentsNewestFirst);
}

export function mergeCommentsNewestFirst<T extends CommentOrderRow>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of existing) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  return sortCommentsNewestFirst([...map.values()]);
}

export function latestCommentCreatedAt(rows: Array<{ createdAt: number }>, fallback = 0): number {
  let max = fallback;
  for (const row of rows) {
    if (row.createdAt > max) max = row.createdAt;
  }
  return max;
}
