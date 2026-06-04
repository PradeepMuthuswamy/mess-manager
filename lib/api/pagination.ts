export type Cursor = { col: string; value: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s) return null;
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed?.col === 'string' && typeof parsed?.value === 'string' && typeof parsed?.id === 'string')
      return parsed as Cursor;
    return null;
  } catch {
    return null;
  }
}
