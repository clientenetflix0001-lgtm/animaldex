// Prepara la imagen elegida para Animaldex Adopciones: la achica y la pasa a
// JPEG antes de enviarla, para que suba rápido con datos móviles. El flyer
// conserva más resolución para que su texto (contacto) se lea con zoom.
// El Worker vuelve a validar formato y tamaño por contenido.
import type { ImagePickerAsset } from 'expo-image-picker';

export type AdoptionImageKind = 'photo' | 'flyer';

const MAX_SIDE: Record<AdoptionImageKind, number> = { photo: 1600, flyer: 2200 };
const QUALITY: Record<AdoptionImageKind, number> = { photo: 0.82, flyer: 0.88 };

export async function prepareAdoptionImage(
  asset: ImagePickerAsset,
  kind: AdoptionImageKind
): Promise<{ dataUrl: string; previewUri: string }> {
  const fallback = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : '';
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
  } catch {}
  if (!fallback) throw new Error('No se pudo leer la imagen. Probá con otra.');
  return { dataUrl: fallback, previewUri: asset.uri };
}
