import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
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
    assert.match(provider, /schemeFromSystemAppearance/);
    assert.match(provider, /AppState\.addEventListener/);
    assert.doesNotMatch(provider, /useColorScheme\(\)/);
    assert.doesNotMatch(provider, /AsyncStorage|SecureStore/);
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
    assert.equal(appJson.expo.android.userInterfaceStyle, 'automatic');
    assert.equal(appJson.expo.android.versionCode, 3);
    assert.ok(appJson.expo.plugins.includes('expo-system-ui'));
    assert.match(read('App.tsx'), /statusBarStyleForScheme\(scheme\)/);
    assert.match(read('package.json'), /"expo-system-ui": "~57\./);
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

  it('light tokens de identidad y chrome no se rediseñaron', () => {
    assert.equal(lightColors.bg, '#FFF9F2');
    assert.equal(lightColors.card, '#FFFFFF');
    assert.equal(lightColors.surfaceElevated, '#FFFFFF');
    assert.equal(lightColors.text, '#2D2016');
    assert.equal(lightColors.textMuted, '#9A8C7E');
    assert.equal(lightColors.border, '#F0E6DA');
    assert.equal(lightColors.primary, '#FF6B4A');
    assert.equal(lightColors.dangerSoft, '#FFE8EC');
    assert.equal(lightColors.warningSoft, '#FFF4E5');
    assert.equal(darkColors.dangerSoft, '#3A1E24');
    assert.equal(darkColors.warningSoft, '#3A2E1C');
  });

  it('pantallas migradas usan useAppTheme y makeStyles', () => {
    const migrated = [
      'screens/ExploreScreen.tsx',
      'screens/AddPetScreen.tsx',
      'screens/AdminTagsScreen.tsx',
      'screens/CreateListingScreen.tsx',
      'screens/CreateReelScreen.tsx',
      'screens/CreateStoryScreen.tsx',
      'screens/MyPetsScreen.tsx',
      'screens/MyAlertsScreen.tsx',
      'screens/QRScannerScreen.tsx',
      'screens/VerifyPhoneScreen.tsx',
      'screens/ReelsScreen.tsx',
      'components/BirthDatePicker.tsx',
      'components/TransferPetSheet.tsx',
      'components/CategoryPickerSheet.tsx',
      'components/LocalityPicker.tsx',
      'components/StoryCommentsSheet.tsx',
    ];
    for (const file of migrated) {
      const src = read(file);
      assert.match(src, /useAppTheme\(\)/, file);
      assert.match(src, /function makeStyles/, file);
      assert.doesNotMatch(src, /Appearance\.addChangeListener/, file);
      assert.doesNotMatch(src, /useColorScheme\(/, file);
    }
  });

  it('Reels/QR inmersivos conservan #000 y sheets usan tokens', () => {
    const reels = read('screens/ReelsScreen.tsx');
    assert.match(reels, /root: \{ flex: 1, backgroundColor: '#000' \}/);
    assert.match(reels, /backgroundColor: colors\.card/);
    const scanner = read('screens/QRScannerScreen.tsx');
    assert.match(scanner, /root: \{ flex: 1, backgroundColor: '#000' \}/);
    assert.match(scanner, /backgroundColor: colors\.card/);
    const comments = read('components/StoryCommentsSheet.tsx');
    assert.match(comments, /backgroundColor: colors\.card/);
    assert.doesNotMatch(comments, /backgroundColor: '#fff'/);
    assert.match(read('screens/AdoptionDiscoveryScreen.tsx'), /backgroundColor: '#000000'/);
    assert.doesNotMatch(read('components/AlertFlyerCanvas.tsx'), /useAppTheme/);
    assert.doesNotMatch(read('components/PostBackgroundCard.tsx'), /useAppTheme/);
  });

  it('StoryViewer no restaura StatusBar blanco opaco', () => {
    const viewer = read('screens/StoryViewerScreen.tsx');
    assert.match(viewer, /StatusBar style="light"/);
    assert.match(viewer, /setBackgroundColor\('transparent'/);
    assert.doesNotMatch(viewer, /setBackgroundColor\('#ffffff'/);
    assert.match(viewer, /scheme === 'dark' \? 'light-content' : 'dark-content'/);
  });

  it('notification icon 96x96 blanco con alpha', () => {
    const png = readFileSync(join(root, 'assets/notification-icon.png'));
    const parsed = decodePngRgba(png);
    assert.equal(parsed.width, 96);
    assert.equal(parsed.height, 96);
    assert.ok(parsed.colorType === 6 || parsed.colorType === 4, 'needs alpha channel');
    assert.ok(parsed.transparent > 200, 'transparent background');
    assert.ok(parsed.opaqueWhite > 20, 'white glyph');
    assert.ok(parsed.opaqueNonWhite === 0, 'no colored fill');
  });
});

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf: Buffer) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  assert.equal(bitDepth, 8);
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const v = raw[src++];
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let val = v;
      if (filter === 1) val = (v + left) & 255;
      else if (filter === 2) val = (v + up) & 255;
      else if (filter === 3) val = (v + ((left + up) >> 1)) & 255;
      else if (filter === 4) val = (v + paeth(left, up, upLeft)) & 255;
      out[y * stride + x] = val;
    }
  }
  let transparent = 0;
  let opaqueWhite = 0;
  let opaqueNonWhite = 0;
  for (let i = 0; i < width * height; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 255;
    if (colorType === 6) {
      r = out[i * 4];
      g = out[i * 4 + 1];
      b = out[i * 4 + 2];
      a = out[i * 4 + 3];
    } else if (colorType === 4) {
      r = g = b = out[i * 2];
      a = out[i * 2 + 1];
    } else if (colorType === 0) {
      r = g = b = out[i];
    }
    if (a < 16) transparent += 1;
    else if (a > 200 && r > 240 && g > 240 && b > 240) opaqueWhite += 1;
    else if (a > 200) opaqueNonWhite += 1;
  }
  return { width, height, colorType, transparent, opaqueWhite, opaqueNonWhite };
}
