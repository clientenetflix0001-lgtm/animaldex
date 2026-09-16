/** Flujo de éxito, presentación y paneles del compositor. No cambia el contrato de createPost. */

/** Tab Crear histórico: sin push lateral. Modal + none superpone Tabs/Feed montados. */
export const CREATE_POST_SCREEN_OPTIONS = {
  headerShown: false,
  presentation: 'modal',
  animation: 'none',
} as const;

/** merge: true evita resetear Tabs (mismo Feed, mismo scroll). */
export const CREATE_POST_SUCCESS_NAV = {
  name: 'Tabs' as const,
  params: { screen: 'Inicio' as const },
  merge: true as const,
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
  navigate: (route: typeof CREATE_POST_SUCCESS_NAV) => void;
}): void {
  navigation.navigate(CREATE_POST_SUCCESS_NAV);
}
