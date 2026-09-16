/** Flujo de éxito y paneles del compositor. No cambia el contrato de createPost. */

export const CREATE_POST_SUCCESS_NAV = {
  name: 'Tabs' as const,
  params: { screen: 'Inicio' as const },
};

export type CreatePostPanel = 'none' | 'photo' | 'background' | 'pet';

export function toggleCreatePostPanel(
  current: CreatePostPanel,
  tapped: Exclude<CreatePostPanel, 'none'>
): CreatePostPanel {
  return current === tapped ? 'none' : tapped;
}

export function tryBeginPublish(lock: { current: boolean }, uploading: boolean): boolean {
  if (lock.current || uploading) return false;
  lock.current = true;
  return true;
}

export function endPublish(lock: { current: boolean }): void {
  lock.current = false;
}

export function shouldShowBackgroundPreview(hasPhoto: boolean, backgroundTouched: boolean): boolean {
  return !hasPhoto && backgroundTouched;
}

export function shouldShowPhotoPreview(photo: string | null, previewUri: string | null): boolean {
  return !!(previewUri || photo);
}

export function backgroundIdForCreatePost(hasPhoto: boolean, backgroundId: string): string | null {
  return hasPhoto ? null : backgroundId;
}

export function navigateAfterSuccessfulCreatePost(navigation: {
  navigate: (name: typeof CREATE_POST_SUCCESS_NAV.name, params: typeof CREATE_POST_SUCCESS_NAV.params) => void;
}): void {
  navigation.navigate(CREATE_POST_SUCCESS_NAV.name, CREATE_POST_SUCCESS_NAV.params);
}
