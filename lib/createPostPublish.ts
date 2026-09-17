/** Flujo de éxito, presentación y paneles del compositor. No cambia el contrato de createPost. */

export const CREATE_POST_ROUTE = 'CreatePost' as const;

/**
 * CreatePost vive en el stack del tab Crear (como el flyer).
 * animation none evita el slide. Sin presentation modal: no comparte
 * Root Stack con CreateAlert/Listing/Story/Reel.
 */
export const CREATE_POST_SCREEN_OPTIONS = {
  headerShown: false,
  animation: 'none',
} as const;

export const CREATE_POST_SUCCESS_TAB = 'Inicio' as const;

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

/**
 * Equivalente al tab histórico: cierra el compositor (vuelve al chooser)
 * y cambia a Inicio. El Feed hermano permanece montado; no resetea Tabs.
 */
export function navigateAfterSuccessfulCreatePost(navigation: {
  popToTop?: () => void;
  getParent?: () => { navigate: (name: string) => void } | undefined;
  navigate: (name: string) => void;
}): void {
  navigation.popToTop?.();
  const tabs = navigation.getParent?.();
  if (tabs) {
    tabs.navigate(CREATE_POST_SUCCESS_TAB);
    return;
  }
  navigation.navigate(CREATE_POST_SUCCESS_TAB);
}
