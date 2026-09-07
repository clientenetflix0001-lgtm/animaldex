import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HEADER_QR_A11Y,
  HEADER_QR_BUTTON_SIZE,
  HEADER_QR_HALO_COLOR,
  HEADER_QR_HALO_SIZE,
  HEADER_QR_ICON_SIZE,
  HEADER_QR_LOGO_GAP,
  HEADER_QR_PREVIOUS_BUTTON,
  HEADER_QR_PREVIOUS_ICON,
  HEADER_QR_PREVIOUS_LOGO_GAP,
  HEADER_QR_REST_MS,
  HEADER_QR_ROUTE,
  HEADER_QR_SPIN_MS,
  headerQrHaloIsDecorative,
  headerQrIsLargerThanBefore,
  headerQrRestLongerThanSpin,
  headerQrSeparatedFromLogo,
} from '../lib/headerQr.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const btn = readFileSync(join(root, 'components/HeaderQrButton.tsx'), 'utf8');
const stories = readFileSync(join(root, 'lib/stories.ts'), 'utf8');
const publicWeb = readFileSync(join(root, 'lib/publicWeb.ts'), 'utf8');

describe('QR del header principal', () => {
  it('4. conserva onPress y ruta actual', () => {
    assert.equal(HEADER_QR_ROUTE, 'QRScanner');
    assert.match(feed, /<HeaderQrButton onPress=\{\(\) => navigation\.navigate\(HEADER_QR_ROUTE\)\} \/>/);
    assert.match(btn, /onPress=\{onPress\}/);
    assert.match(btn, /accessibilityLabel=\{HEADER_QR_A11Y\}/);
    assert.equal(HEADER_QR_A11Y, 'Escanear código QR');
  });

  it('5. QR tiene mayor tamaño visual', () => {
    assert.equal(headerQrIsLargerThanBefore(), true);
    assert.ok(HEADER_QR_BUTTON_SIZE > HEADER_QR_PREVIOUS_BUTTON);
    assert.ok(HEADER_QR_ICON_SIZE > HEADER_QR_PREVIOUS_ICON);
    assert.ok(HEADER_QR_HALO_SIZE >= HEADER_QR_PREVIOUS_BUTTON * 2);
    assert.match(btn, /HEADER_QR_ICON_SIZE/);
    assert.match(btn, /HEADER_QR_BUTTON_SIZE/);
  });

  it('6. QR está separado del logo', () => {
    assert.equal(headerQrSeparatedFromLogo(), true);
    assert.ok(HEADER_QR_LOGO_GAP > HEADER_QR_PREVIOUS_LOGO_GAP);
    assert.match(btn, /marginLeft: HEADER_QR_LOGO_GAP/);
    assert.match(feed, /logoRow: \{ flexDirection: 'row', alignItems: 'center', gap: 0/);
    assert.match(feed, /animaldex-logo-mark\.png/);
    assert.match(feed, />nimaldex</);
  });

  it('7. aureola es decorativa y no intercepta touches', () => {
    assert.equal(headerQrHaloIsDecorative(), true);
    assert.match(btn, /pointerEvents="none"/);
    assert.match(btn, /HEADER_QR_HALO_COLOR/);
    assert.equal(HEADER_QR_HALO_COLOR, '#1E6CFF');
    assert.doesNotMatch(HEADER_QR_HALO_COLOR, /FF6B4A/);
  });

  it('8. animación periódica, no rotación permanente del QR', () => {
    assert.equal(headerQrRestLongerThanSpin(), true);
    assert.ok(HEADER_QR_REST_MS > HEADER_QR_SPIN_MS);
    assert.match(btn, /withDelay\(HEADER_QR_REST_MS/);
    assert.match(btn, /withRepeat/);
    assert.match(btn, /isReduceMotionEnabled/);
    assert.doesNotMatch(btn, /withRepeat\(\s*withTiming\(360/);
  });

  it('9. el QR real permanece estático', () => {
    assert.match(btn, /name="qr-code-outline"/);
    const iconBlock = btn.slice(btn.indexOf('<Ionicons'), btn.indexOf('/>', btn.indexOf('<Ionicons')) + 2);
    assert.match(iconBlock, /qr-code-outline/);
    assert.doesNotMatch(iconBlock, /rotate|transform|Animated/);
    assert.doesNotMatch(btn, /Animated\.createAnimatedComponent\(Ionicons\)/);
  });

  it('10. no regresión del header', () => {
    assert.match(feed, /navigation\.navigate\('Explorar'\)/);
    assert.match(feed, /navigation\.navigate\('Actividad'\)/);
    assert.match(feed, /<ProfileSwitcher/);
    assert.match(feed, /<StoryRail/);
    assert.match(feed, /<WantToAdoptButton/);
    assert.doesNotMatch(stories, /HeaderQrButton/);
    assert.match(publicWeb, /PUBLIC_WEB_ORIGIN = 'https:\/\/animaldex\.com'/);
  });
});
