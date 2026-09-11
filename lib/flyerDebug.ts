import AsyncStorage from '@react-native-async-storage/async-storage';

export const FLYER_DEBUG_STORAGE_KEY = 'lastFlyerDebugStage';

export type FlyerDebugStage =
  | 'FLYER_DEBUG_01_PRESS'
  | 'FLYER_DEBUG_02_NAVIGATION'
  | 'FLYER_DEBUG_03_SCREEN_MOUNT'
  | 'FLYER_DEBUG_04_DRAFT_INIT'
  | 'FLYER_DEBUG_05_FORM_RENDER'
  | 'FLYER_DEBUG_06_PREVIEW_NAV'
  | 'FLYER_DEBUG_07_PREVIEW_MOUNT'
  | 'FLYER_DEBUG_ERROR'
  | 'CREATE_FLYER_DRAFT_INIT'
  | 'CREATE_FLYER_DRAFT_READY'
  | 'CREATE_FLYER_DRAFT_ERROR';

export type FlyerDebugMeta = {
  route?: string;
  navigator?: string;
  dest?: string;
  draftReady?: boolean;
};

/** Breadcrumb local. Sin foto, nombre, ubicación ni contacto. */
export async function flyerDebug(stage: FlyerDebugStage, meta?: FlyerDebugMeta): Promise<void> {
  const record = {
    stage,
    route: meta?.route,
    navigator: meta?.navigator,
    dest: meta?.dest,
    draftReady: meta?.draftReady,
  };
  console.warn(stage, record);
  try {
    await AsyncStorage.setItem(FLYER_DEBUG_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Diagnóstico: no bloquear el flujo.
  }
}
