import type { ImagePickerOptions } from 'expo-image-picker';

/** Selección de galería del Feed / Create Post: sin recorte obligatorio. */
export const GALLERY_IMAGE_PICKER_OPTIONS: ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.9,
  base64: true,
};
