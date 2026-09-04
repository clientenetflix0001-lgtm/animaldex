export const MAX_BIO_WORDS = 155;
export const BIO_WORD_LIMIT_ERROR = 'Máximo 155 palabras.';

export function countBioWords(text?: string | null): number {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function isBioWithinWordLimit(text?: string | null): boolean {
  return countBioWords(text) <= MAX_BIO_WORDS;
}

export function sanitizeBio(text?: string | null): string {
  return String(text ?? '').trim();
}

export function acceptedBio(raw?: string | null): { ok: true; bio: string } | { ok: false; error: string } {
  const bio = sanitizeBio(raw);
  if (!isBioWithinWordLimit(bio)) return { ok: false, error: BIO_WORD_LIMIT_ERROR };
  return { ok: true, bio };
}
