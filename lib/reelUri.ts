/**
 * URIs locales para fetch/PUT a Mux.
 * react-native-video-trim 8.2.2 (Android) devuelve File.absolutePath
 * sin esquema: /data/user/0/.../trimmedVideo_X.mp4
 * fetch() nativo exige un URL con protocolo (file://, content://, https://).
 */

const WITH_SCHEME = /^(file|content|http|https):\/\//i;

export function normalizeLocalFileUri(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (WITH_SCHEME.test(value)) return value;
  if (/^file:\//i.test(value)) {
    return `file://${value.replace(/^file:\/*/, '/')}`;
  }
  if (value.startsWith('/')) return `file://${value}`;
  return value;
}

export function isNormalizedLocalFileUri(uri: string | null | undefined): boolean {
  const v = String(uri || '');
  return v.startsWith('file://') || v.startsWith('content://');
}
