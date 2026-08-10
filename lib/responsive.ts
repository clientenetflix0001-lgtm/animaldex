// ============================================================
// Sistema responsive de Animaldex
// ============================================================
// Breakpoints:
//   mobile   < 768     → bottom tabs (app nativa, sin cambios)
//   tablet   768-1023  → bottom tabs (sin cambios)
//   laptop   1024-1439 → sidebar compacto (solo íconos) + feed centrado
//   desktop  1440-1919 → sidebar completo + feed + panel derecho
//   wide     ≥ 1920    → sidebar completo + feed + panel derecho amplio
// El layout de escritorio SOLO aplica en web; en nativo siempre tabs.
// ============================================================

import { useWindowDimensions, Platform } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'laptop' | 'desktop' | 'wide';

export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1920) return 'wide';
  if (width >= 1440) return 'desktop';
  if (width >= 1024) return 'laptop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

export interface Responsive {
  width: number;
  height: number;
  bp: Breakpoint;
  isWeb: boolean;
  /** true = layout escritorio (web y ancho >= 1024) */
  desktopWeb: boolean;
  sidebarMode: 'none' | 'rail' | 'full';
  sidebarWidth: number;
  /** Panel de sugerencias a la derecha del feed */
  showRightPanel: boolean;
  /** Ancho disponible para el contenido (descontando sidebar) */
  contentWidth: number;
  isMobile: boolean;
  isTablet: boolean;
}

export const SIDEBAR_FULL = 244;
export const SIDEBAR_RAIL = 76;

export const CONTENT = {
  feed: 630,       // columna central del feed (estilo Instagram)
  page: 935,       // perfiles y grillas
  narrow: 680,     // formularios / actividad
  rightPanel: 340, // panel de sugerencias
};

let loggedOnce = false;

export function useBreakpoint(): Responsive {
  const { width, height } = useWindowDimensions();
  const bp = getBreakpoint(width);
  // Diagnóstico (visible en la consola del navegador con F12)
  if (Platform.OS === 'web' && !loggedOnce && width > 0) {
    loggedOnce = true;
    // eslint-disable-next-line no-console
    console.log(
      `[Animaldex] viewport=${Math.round(width)}x${Math.round(height)} → breakpoint="${bp}" → layout=${width >= 1024 ? 'ESCRITORIO (sidebar)' : 'MÓVIL (tabs)'}`
    );
  }
  const isWeb = Platform.OS === 'web';
  const desktopWeb = isWeb && width >= 1024;
  const sidebarMode: 'none' | 'rail' | 'full' = !desktopWeb
    ? 'none'
    : bp === 'laptop'
    ? 'rail'
    : 'full';
  const sidebarWidth =
    sidebarMode === 'full' ? SIDEBAR_FULL : sidebarMode === 'rail' ? SIDEBAR_RAIL : 0;
  const contentWidth = width - sidebarWidth;
  const showRightPanel = desktopWeb && contentWidth >= CONTENT.feed + CONTENT.rightPanel + 80;
  return {
    width,
    height,
    bp,
    isWeb,
    desktopWeb,
    sidebarMode,
    sidebarWidth,
    showRightPanel,
    contentWidth,
    isMobile: bp === 'mobile',
    isTablet: bp === 'tablet',
  };
}
