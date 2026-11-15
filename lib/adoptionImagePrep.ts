// Prepara la imagen de Animaldex Adopciones antes de subirla.
// En la web no se pide base64 al selector: FileReader del archivo original
// falla en Chrome de Android con «Failed to read the selected media because
// the operation failed», sobre todo en fotos grandes, y a los minutos vuelve
// a funcionar cuando el navegador libera memoria. Acá se lee el File, se
// achica en un canvas y recién ahí se arma un JPEG.
// El Worker vuelve a validar formato y tamaño por contenido.
import type { ImagePickerAsset } from 'expo-image-picker';

export type AdoptionImageKind = 'photo' | 'flyer';

const MAX_SIDE: Record<AdoptionImageKind, number> = { photo: 1600, flyer: 2200 };
const QUALITY: Record<AdoptionImageKind, number> = { photo: 0.82, flyer: 0.88 };

/** Tope de lectura local, antes de comprimir. El JPEG resultante queda bajo los 8 MB del Worker. */
const READ_LIMIT_BYTES = 25 * 1024 * 1024;
const MAX_JPEG_BASE64 = Math.ceil(8_000_000 / 3) * 4;

export type AdoptionImageErrorCode = 'read' | 'process' | 'size' | 'format';

export class AdoptionImageError extends Error {
  code: AdoptionImageErrorCode;
  constructor(code: AdoptionImageErrorCode, message: string) {
    super(message);
    this.name = 'AdoptionImageError';
    this.code = code;
  }
}

export async function prepareAdoptionImage(
  asset: ImagePickerAsset,
  kind: AdoptionImageKind
): Promise<{ dataUrl: string; previewUri: string }> {
  if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
    const blob = await readPickedBlob(asset);
    const dataUrl = await blobToJpeg(blob, kind);
    return { dataUrl, previewUri: dataUrl };
  }
  return prepareWithManipulator(asset, kind);
}

export function explainAdoptionImageError(error: unknown, phase: 'read' | 'upload'): string {
  if (error instanceof AdoptionImageError) return error.message;
  const message = error instanceof Error ? error.message : '';
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 0;
  if (/failed to read the selected media|ERR_FILE_READER|operation failed/i.test(message)) {
    return 'No pudimos leer el archivo en el navegador. Tocá Reintentar. Si vuelve a fallar, elegí una foto JPG o PNG más liviana.';
  }
  if (status === 401 || /inici[aá] sesi[oó]n|sesi[oó]n venc/i.test(message)) {
    return 'Tu sesión no está activa. Entrá de nuevo y publicá. La foto sigue seleccionada.';
  }
  if (status === 429 || /demasiadas im[aá]genes/i.test(message)) {
    return 'Hay un límite de 20 imágenes por minuto para proteger el servicio. Esperá un momento y tocá Publicar. La foto sigue seleccionada.';
  }
  if (status === 413 || /demasiado grande/i.test(message)) return message;
  if (status === 415) return message || 'Ese archivo no es una foto JPG, PNG, WebP o GIF.';
  if (status === 502 || status === 503) {
    return 'La carga de imágenes no respondió. Tocá Publicar de nuevo. La foto sigue seleccionada.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return phase === 'upload'
      ? 'No hay conexión para subir la foto. Revisá la red y tocá Publicar. La foto sigue seleccionada.'
      : 'No pudimos leer la foto. Tocá Reintentar o elegí otra.';
  }
  if (message) return message;
  return phase === 'upload'
    ? 'No se pudo publicar. Probá de nuevo. La foto sigue seleccionada.'
    : 'No se pudo preparar la imagen. Tocá Reintentar o elegí otra.';
}

async function readPickedBlob(asset: ImagePickerAsset): Promise<Blob> {
  const file = (asset as { file?: Blob }).file;
  if (file && typeof file.size === 'number') {
    if (file.size <= 0) throw new AdoptionImageError('read', 'El archivo seleccionado está vacío. Elegí otra foto.');
    if (file.size > READ_LIMIT_BYTES) {
      throw new AdoptionImageError('size', 'La imagen pesa más de 25 MB. Elegí una más chica.');
    }
    if (isHeic(file.type, asset.fileName, asset.mimeType)) {
      throw new AdoptionImageError('format', 'Este navegador no lee fotos HEIC. Elegí una JPG o PNG.');
    }
    return file.slice(0, file.size, file.type || asset.mimeType || 'application/octet-stream');
  }
  if (!asset.uri) {
    throw new AdoptionImageError('read', 'No pudimos leer la foto seleccionada. Elegila de nuevo.');
  }
  if (isHeic(asset.mimeType, asset.fileName, asset.uri)) {
    throw new AdoptionImageError('format', 'Este navegador no lee fotos HEIC. Elegí una JPG o PNG.');
  }
  let response: Response;
  try {
    response = await fetch(asset.uri);
  } catch {
    throw new AdoptionImageError('read', 'No pudimos leer la foto seleccionada. Tocá Reintentar o elegí otra.');
  }
  if (!response.ok) {
    throw new AdoptionImageError('read', 'No pudimos leer la foto seleccionada. Tocá Reintentar o elegí otra.');
  }
  const blob = await response.blob();
  if (blob.size <= 0) throw new AdoptionImageError('read', 'El archivo seleccionado está vacío. Elegí otra foto.');
  if (blob.size > READ_LIMIT_BYTES) {
    throw new AdoptionImageError('size', 'La imagen pesa más de 25 MB. Elegí una más chica.');
  }
  return blob;
}

function isHeic(mime?: string | null, name?: string | null, extra?: string | null): boolean {
  const text = `${mime || ''} ${name || ''} ${extra || ''}`.toLowerCase();
  return text.includes('heic') || text.includes('heif');
}

async function blobToJpeg(blob: Blob, kind: AdoptionImageKind): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new AdoptionImageError(
      'format',
      'No pudimos abrir esta imagen. Elegí una foto JPG, PNG o WebP.'
    );
  }
  try {
    const sides = [MAX_SIDE[kind], 1600, 1280];
    const qualities = [QUALITY[kind], 0.72, 0.58];
    let last = '';
    for (let i = 0; i < sides.length; i += 1) {
      last = drawJpeg(bitmap, sides[i], qualities[i]);
      if (last.length <= MAX_JPEG_BASE64) return last;
    }
    throw new AdoptionImageError('size', 'La imagen sigue siendo demasiado grande después de achicarla. Elegí otra.');
  } catch (error) {
    if (error instanceof AdoptionImageError) throw error;
    throw new AdoptionImageError('process', 'No se pudo preparar la imagen en este navegador. Tocá Reintentar o elegí otra.');
  } finally {
    bitmap.close?.();
  }
}

function drawJpeg(bitmap: ImageBitmap, maxSide: number, quality: number): string {
  const longest = Math.max(bitmap.width, bitmap.height, 1);
  const scale = Math.min(1, maxSide / longest);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AdoptionImageError('process', 'No se pudo preparar la imagen en este navegador.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (!dataUrl.startsWith('data:image/jpeg')) {
    throw new AdoptionImageError('process', 'No se pudo convertir la imagen a JPEG.');
  }
  return dataUrl;
}

async function prepareWithManipulator(
  asset: ImagePickerAsset,
  kind: AdoptionImageKind
): Promise<{ dataUrl: string; previewUri: string }> {
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const max = MAX_SIDE[kind];
    const context = ImageManipulator.manipulate(asset.uri);
    const w = asset.width || 0;
    const h = asset.height || 0;
    if (w > max || h > max) {
      context.resize(w >= h ? { width: max } : { height: max });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY[kind], base64: true });
    if (saved.base64) return { dataUrl: `data:image/jpeg;base64,${saved.base64}`, previewUri: saved.uri };
  } catch {
    // El camino web no llega acá. En nativo, el mensaje de abajo es el de lectura.
  }
  throw new AdoptionImageError('read', 'No pudimos leer la foto seleccionada. Elegila de nuevo.');
}
