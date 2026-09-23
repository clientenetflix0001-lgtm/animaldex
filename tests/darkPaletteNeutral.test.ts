import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTACT_THEME,
  FLYER_IGNORES_COLOR_SCHEME,
  NOTIFICATION_ACCENT,
  NOTIFICATION_ICON_PATH,
  POST_BACKGROUND_IGNORES_COLOR_SCHEME,
  darkColors,
  lightColors,
} from '../lib/appTheme.ts';
import { FEED_POST_GAP } from '../lib/theme.ts';
import { WHATSAPP_GREEN } from '../lib/petOwnerContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const BANNED_WARM_DARK = ['#16110E', '#221C18', '#2C241F', '#3A322C'] as const;

const NEUTRAL_SURFACE_KEYS = [
  'bg',
  'card',
  'background',
  'surface',
  'surfaceElevated',
  'surfaceSoft',
  'cardBackground',
  'inputBackground',
  'border',
  'borderStrong',
  'separator',
  'primarysoft',
  'warningSoft',
] as const;

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace('#', '');
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function chromaSpan(hex: string): number {
  const { r, g, b } = hexRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe('dark palette neutra Instagram-like', () => {
  it('A. darkColors no usa los negros marrones anteriores', () => {
    const values = Object.values(darkColors).map((v) => v.toUpperCase());
    for (const banned of BANNED_WARM_DARK) {
      assert.equal(values.includes(banned.toUpperCase()), false, banned);
    }
    const themeSrc = read('lib/appTheme.ts');
    for (const banned of BANNED_WARM_DARK) {
      assert.doesNotMatch(themeSrc, new RegExp(banned, 'i'));
    }
  });

  it('B. dark background es negro/neutro', () => {
    assert.equal(darkColors.bg, '#000000');
    assert.equal(darkColors.card, '#000000');
    assert.equal(darkColors.surface, '#121212');
    assert.equal(darkColors.surfaceElevated, '#1C1C1E');
    assert.equal(darkColors.surfaceSoft, '#262626');
    for (const key of NEUTRAL_SURFACE_KEYS) {
      assert.ok(chromaSpan(darkColors[key]) <= 4, `${key} ${darkColors[key]}`);
    }
  });

  it('C. lightColors permanece exactamente igual en tokens visibles', () => {
    assert.equal(lightColors.bg, '#FFF9F2');
    assert.equal(lightColors.card, '#FFFFFF');
    assert.equal(lightColors.text, '#2D2016');
    assert.equal(lightColors.textMuted, '#9A8C7E');
    assert.equal(lightColors.border, '#F0E6DA');
    assert.equal(lightColors.primary, '#FF6B4A');
    assert.equal(lightColors.primarysoft, '#FFE8E1');
    assert.equal(lightColors.secondary, '#2EC4B6');
    assert.equal(lightColors.surface, '#FFFFFF');
    assert.equal(lightColors.surfaceElevated, '#FFFFFF');
    assert.equal(lightColors.inputBackground, '#FFFFFF');
    assert.equal(lightColors.dangerSoft, '#FFE8EC');
    assert.equal(lightColors.warningSoft, '#FFF4E5');
    assert.equal(lightColors.surfaceSoft, '#FFF9F2');
    assert.equal(lightColors.borderStrong, '#F0E6DA');
  });

  it('D. primary sigue #FF6B4A', () => {
    assert.equal(lightColors.primary, '#FF6B4A');
    assert.equal(darkColors.primary, '#FF6B4A');
    assert.equal(NOTIFICATION_ACCENT, '#FF6B4A');
  });

  it('E. WhatsApp conserva #25D366', () => {
    assert.equal(WHATSAPP_GREEN, '#25D366');
    assert.equal(CONTACT_THEME.whatsapp, '#25D366');
  });

  it('F. AlertFlyerCanvas no depende del theme', () => {
    assert.equal(FLYER_IGNORES_COLOR_SCHEME, true);
    const canvas = read('components/AlertFlyerCanvas.tsx');
    assert.doesNotMatch(canvas, /useAppTheme|useColorScheme|Appearance|darkColors/);
    assert.match(canvas, /color: '#2D2016'/);
  });

  it('G. PostBackgroundCard no cambia', () => {
    assert.equal(POST_BACKGROUND_IGNORES_COLOR_SCHEME, true);
    const bg = read('components/PostBackgroundCard.tsx');
    assert.doesNotMatch(bg, /useAppTheme|useColorScheme|Appearance/);
    assert.match(bg, /backgroundColor: colors\.primarysoft/);
  });

  it('H. Feed gap sigue 7', () => {
    assert.equal(FEED_POST_GAP, 7);
    assert.match(read('lib/theme.ts'), /export const FEED_POST_GAP = 7/);
    assert.match(read('components/PostCard.tsx'), /marginBottom: FEED_POST_GAP/);
  });

  it('I. ThemeProvider sigue con un único listener global de Appearance', () => {
    const provider = read('lib/ThemeProvider.tsx');
    assert.equal((provider.match(/Appearance\.addChangeListener/g) || []).length, 1);
    assert.doesNotMatch(provider, /useColorScheme\(\)/);
    const card = read('components/PostCard.tsx');
    assert.doesNotMatch(card, /Appearance\.addChangeListener/);
    assert.doesNotMatch(card, /useColorScheme\(/);
    assert.match(card, /export const PostCard = memo\(/);
  });

  it('J. notification icon/config no cambia', () => {
    const appJson = JSON.parse(read('app.json'));
    const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
    assert.equal(plugin[1].icon, NOTIFICATION_ICON_PATH);
    assert.equal(plugin[1].color, '#FF6B4A');
    assert.equal(NOTIFICATION_ICON_PATH, './assets/notification-icon.png');
  });

  it('texto dark es blanco/gris neutro', () => {
    assert.equal(darkColors.text, '#F5F5F5');
    assert.equal(darkColors.textMuted, '#A8A8A8');
    assert.equal(darkColors.icon, '#F5F5F5');
    assert.ok(chromaSpan(darkColors.text) === 0);
    assert.ok(chromaSpan(darkColors.textMuted) === 0);
  });

  it('identidad funcional no se vuelve gris', () => {
    assert.equal(darkColors.secondary, '#2EC4B6');
    assert.equal(darkColors.heart, '#FF3B5C');
    assert.equal(darkColors.gold, '#FFB800');
    assert.equal(darkColors.dangerSoft, '#3A1E24');
    assert.equal(CONTACT_THEME.phone, '#FF6B4A');
  });

  it('owner card usa borde semántico y no toca ownerContact', () => {
    const pet = read('screens/PetProfileScreen.tsx');
    assert.match(pet, /borderColor: colors\.borderStrong/);
    assert.match(pet, /ownerCardModel/);
    assert.match(pet, /WHATSAPP_GREEN/);
    assert.doesNotMatch(pet, /pet_contact_visible/);
  });
});
