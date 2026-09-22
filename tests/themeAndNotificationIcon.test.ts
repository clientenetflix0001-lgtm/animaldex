import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTACT_THEME,
  FLYER_IGNORES_COLOR_SCHEME,
  NATIVE_AAB_REASONS,
  NOTIFICATION_ACCENT,
  NOTIFICATION_ICON_PATH,
  PHOTO_FILTER_IN_DARK_MODE,
  POST_BACKGROUND_IGNORES_COLOR_SCHEME,
  THEME_PREFERENCE,
  colorsForScheme,
  darkColors,
  lightColors,
  navigationThemeColors,
  resolveAppScheme,
  statusBarStyleForScheme,
} from '../lib/appTheme.ts';
import { colors, FEED_POST_GAP } from '../lib/theme.ts';
import { WHATSAPP_GREEN, PHONE_ORANGE } from '../lib/petOwnerContact.ts';
import { publicTagTargetFromStatus } from '../lib/tagPublicResolve.ts';
import { CREATE_POST_SCREEN_OPTIONS, CREATE_POST_ROUTE } from '../lib/createPostPublish.ts';
import { PUSH_CHANNEL_PETS, PUSH_CHANNEL_PETS_URGENT, PUSH_CHANNEL_REMINDERS } from '../lib/pushPolicy.ts';
import { PUSH_KIND, CRON_DAILY, CRON_PUSH_FLUSH, scheduledTasksForCron } from '../lib/pushCenter.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('theme system + notification icon', () => {
  it('1. system light → light theme', () => {
    assert.equal(resolveAppScheme('light'), 'light');
    assert.equal(colorsForScheme('light').bg, '#FFF9F2');
    assert.equal(colorsForScheme('light').card, '#FFFFFF');
    assert.equal(colors.bg, lightColors.bg);
  });

  it('2. system dark → dark theme', () => {
    assert.equal(resolveAppScheme('dark'), 'dark');
    assert.equal(colorsForScheme('dark').bg, darkColors.bg);
    assert.equal(colorsForScheme('dark').text, darkColors.text);
    assert.notEqual(darkColors.bg, '#000000');
  });

  it('3. cambio runtime light/dark', () => {
    assert.equal(THEME_PREFERENCE, 'system');
    assert.equal(resolveAppScheme(resolveAppScheme('dark') === 'dark' ? 'light' : 'dark'), 'light');
    const provider = read('lib/ThemeProvider.tsx');
    assert.match(read('lib/themeContext.ts'), /export function useAppTheme/);
    assert.match(provider, /Appearance\.addChangeListener/);
    assert.match(provider, /setScheme\(resolveAppScheme\(colorScheme\)\)/);
    assert.doesNotMatch(provider, /useColorScheme\(\)/);
  });

  it('4. Feed conserva background_id', () => {
    assert.equal(POST_BACKGROUND_IGNORES_COLOR_SCHEME, true);
    const card = read('components/PostCard.tsx');
    assert.match(card, /backgroundId=\{post\.backgroundId\}/);
    assert.match(card, /isTextBackgroundPost\(post\) && post\.backgroundId/);
    const bg = read('components/PostBackgroundCard.tsx');
    assert.doesNotMatch(bg, /useAppTheme|useColorScheme|Appearance/);
  });

  it('5. PawPrintOverlay intacto', () => {
    const overlay = read('components/PawPrintOverlay.tsx');
    assert.equal((overlay.match(/<Image/g) || []).length, 1);
    assert.doesNotMatch(overlay, /Ionicons/);
    assert.equal(FEED_POST_GAP, 7);
  });

  it('6. flyer no cambia por dark mode', () => {
    assert.equal(FLYER_IGNORES_COLOR_SCHEME, true);
    const flyer = read('lib/alertFlyer.ts');
    assert.doesNotMatch(flyer, /useAppTheme|darkColors|Appearance/);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /backgroundColor: '#FFFFFF'/);
    assert.match(preview, /AlertFlyerCanvas/);
  });

  it('7. owner contact buttons visibles en ambos themes', () => {
    assert.equal(CONTACT_THEME.whatsapp, WHATSAPP_GREEN);
    assert.equal(CONTACT_THEME.phone, PHONE_ORANGE);
    const pet = read('screens/PetProfileScreen.tsx');
    assert.match(pet, /WHATSAPP_GREEN/);
    assert.match(pet, /PHONE_ORANGE/);
    assert.match(pet, /logo-whatsapp/);
  });

  it('8. WhatsApp verde', () => {
    assert.equal(WHATSAPP_GREEN, '#25D366');
  });

  it('9. teléfono naranja', () => {
    assert.equal(PHONE_ORANGE, '#FF6B4A');
    assert.equal(NOTIFICATION_ACCENT, '#FF6B4A');
  });

  it('10. QR público intacto', () => {
    const claimed = publicTagTargetFromStatus('6544FF', { exists: true, status: 'claimed', pet: { id: 'p1' } });
    assert.deepEqual(claimed, { kind: 'pet', petId: 'p1' });
    assert.equal(publicTagTargetFromStatus('AAA', { exists: true, status: 'unclaimed' }).kind, 'claim');
    assert.equal(publicTagTargetFromStatus('Z', { exists: false }).kind, 'unavailable');
  });

  it('11. navegación intacta', () => {
    const app = read('App.tsx');
    assert.match(app, /NavigationContainer/);
    assert.match(app, /DarkTheme/);
    assert.match(app, /navigationThemeColors\(scheme\)/);
    assert.match(app, /name="TagWelcome"/);
    assert.match(read('lib/tabProfileStack.tsx'), /name="CreatePost"/);
    assert.equal(navigationThemeColors('dark').background, darkColors.bg);
  });

  it('12. CreatePost flujo intacto', () => {
    assert.equal(CREATE_POST_ROUTE, 'CreatePost');
    assert.equal(CREATE_POST_SCREEN_OPTIONS.headerShown, false);
    assert.equal(CREATE_POST_SCREEN_OPTIONS.animation, 'none');
    const stack = read('lib/tabProfileStack.tsx');
    assert.match(stack, /CREATE_POST_SCREEN_OPTIONS/);
  });

  it('13. notification icon configurado', () => {
    const appJson = JSON.parse(read('app.json'));
    const plugin = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
    assert.equal(plugin[1].icon, NOTIFICATION_ICON_PATH);
    assert.equal(plugin[1].color, NOTIFICATION_ACCENT);
    const icon = statSync(join(root, 'assets/notification-icon.png'));
    assert.ok(icon.size > 400, 'icon should not be the old blank 313-byte file');
    const header = readFileSync(join(root, 'assets/notification-icon.png'));
    assert.equal(header[0], 0x89);
    assert.equal(header[1], 0x50);
  });

  it('14. notification channels intactos', () => {
    const push = read('lib/push.ts');
    assert.match(push, /PUSH_CHANNEL_PETS/);
    assert.match(push, /PUSH_CHANNEL_PETS_URGENT/);
    assert.match(push, /PUSH_CHANNEL_REMINDERS/);
    assert.equal(PUSH_CHANNEL_PETS, 'mascotas');
    assert.equal(PUSH_CHANNEL_REMINDERS, 'recordatorios');
  });

  it('15. mascotas-urgentes intacto', () => {
    assert.equal(PUSH_CHANNEL_PETS_URGENT, 'mascotas-urgentes');
    assert.match(read('lib/push.ts'), /Alertas importantes de mascotas/);
    assert.match(read('lib/pushPolicy.ts'), /PUSH_CHANNEL_PETS_URGENT/);
  });

  it('16. Push Center intacto', () => {
    assert.equal(PUSH_KIND.LOCATION, 'location');
    assert.equal(PUSH_KIND.LOST_BREED_MATCH, 'lost_breed_match');
    assert.deepEqual(scheduledTasksForCron(CRON_PUSH_FLUSH), ['flushDuePushBatches']);
    assert.equal(CRON_DAILY, '0 11 * * *');
  });

  it('StatusBar y userInterfaceStyle automatic', () => {
    assert.equal(statusBarStyleForScheme('light'), 'dark');
    assert.equal(statusBarStyleForScheme('dark'), 'light');
    const appJson = JSON.parse(read('app.json'));
    assert.equal(appJson.expo.userInterfaceStyle, 'automatic');
    assert.match(read('App.tsx'), /statusBarStyleForScheme\(scheme\)/);
  });

  it('fotos sin filtro y naranja conservado', () => {
    assert.equal(PHOTO_FILTER_IN_DARK_MODE, false);
    assert.equal(lightColors.primary, darkColors.primary);
    assert.equal(NATIVE_AAB_REASONS.includes('expo-notifications small icon asset'), true);
  });

  it('PostCard no escucha Appearance por tarjeta', () => {
    const card = read('components/PostCard.tsx');
    assert.doesNotMatch(card, /Appearance\.addChangeListener/);
    assert.doesNotMatch(card, /useColorScheme\(/);
    assert.match(card, /useAppTheme\(\)/);
    assert.match(card, /export const PostCard = memo\(/);
  });
});
