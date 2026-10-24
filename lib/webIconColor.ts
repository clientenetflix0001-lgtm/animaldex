/**
 * Color de iconos de interfaz en web.
 * Tema claro: #000000. Tema oscuro: #FFFFFF.
 * El scheme lo decide useAppTheme() (sistema), no colors.bg estático.
 * No se aplica a fotos, logo, overlays sobre media ni iconos semánticos
 * (error, alerta tipificada, WhatsApp, like activo, verificado).
 */

import { colors, UI_ICON_DARK, UI_ICON_LIGHT } from './theme.ts';

export { UI_ICON_DARK, UI_ICON_LIGHT };

const SEMANTIC = new Set(
  [
    colors.heart,
    colors.gold,
    colors.secondary,
    '#25D366',
    '#128C7E',
    '#E0483E',
    '#2EA65A',
    '#A94CF4',
    '#FF3B30',
    '#DC2626',
    '#EF4444',
    '#F59E0B',
    '#EAB308',
  ].map((c) => normalizeHex(c))
);

function normalizeHex(value: string | undefined | null): string {
  return String(value || '').trim().toLowerCase();
}

export function isOnMediaIconColor(color: string | undefined | null): boolean {
  const c = normalizeHex(color);
  // Solo overlays sobre foto. #F5F5F5 es text/icon del tema oscuro y sí se unifica.
  return c === '#fff' || c === '#ffffff' || c === 'white' || c === '#eeeeee' || c === '#ddd' || c === '#dddddd';
}

export function isSemanticIconColor(color: string | undefined | null): boolean {
  return SEMANTIC.has(normalizeHex(color));
}

export function paletteIsDark(bg: string): boolean {
  const hex = normalizeHex(bg).replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma < 0.45;
}

export function webUiIconColor(scheme: 'light' | 'dark' = 'light'): string {
  return scheme === 'dark' ? UI_ICON_DARK : UI_ICON_LIGHT;
}

/** Resuelve el color final de un Ionicons de chrome. Native: no toca. */
export function resolveUiIconColor(
  requested: string | undefined,
  scheme: 'light' | 'dark' = 'light',
  platform: string = 'web'
): string {
  const fallback = requested || colors.text;
  if (platform !== 'web') return fallback;
  if (isOnMediaIconColor(requested) || isSemanticIconColor(requested)) return fallback;
  return webUiIconColor(scheme);
}
