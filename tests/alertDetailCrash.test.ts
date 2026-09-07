import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alertBadgeColor,
  alertBadgeText,
  alertContextLine,
  alertFoundSafeNote,
  isAlertResolved,
} from '../lib/alerts.ts';
import { adoptCtaLabel } from '../lib/adoptionContact.ts';
import { resolveAppLink } from '../lib/appLinks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const detail = readFileSync(join(root, 'screens/AlertDetailScreen.tsx'), 'utf8');
const create = readFileSync(join(root, 'screens/CreateAlertScreen.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/AlertCard.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const postDetail = readFileSync(join(root, 'screens/PostDetailScreen.tsx'), 'utf8');
const keyboard = readFileSync(join(root, 'components/CommentKeyboardView.tsx'), 'utf8');

/** Contrato Worker camelCase con campos nuevos NULL (alerta legacy). */
function legacyAlert(type: 'lost' | 'sighting' | 'found' | 'adoption') {
  return {
    id: 'alert-legacy-1',
    userId: 'u-1',
    type,
    status: 'active' as const,
    petName: type === 'lost' || type === 'adoption' ? 'Nina' : null,
    species: 'perro',
    breed: '',
    description: 'Color negro',
    image: 'https://example.com/a.jpg',
    locality: 'Salta',
    province: 'Salta',
    country: 'AR',
    lat: null,
    lon: null,
    eventDate: null,
    createdAt: 1786333609808,
    renewedAt: null,
    bumpedAt: null,
    resolvedAt: null,
    resolutionType: null,
    sex: null,
    authorProfileId: null,
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    username: 'lucasfuentes',
    userName: 'Lucas',
    userAvatar: null,
  };
}

describe('AlertDetail crash: CommentKeyboardView', () => {
  it('el path logueado usa CommentKeyboardView', () => {
    assert.match(detail, /<CommentKeyboardView>/);
    assert.match(detail, /<\/CommentKeyboardView>/);
  });

  it('CommentKeyboardView está importado (ReferenceError en Samsung si falta)', () => {
    assert.match(
      detail,
      /import \{ CommentKeyboardView \} from '\.\.\/components\/CommentKeyboardView'/
    );
    const useIdx = detail.indexOf('<CommentKeyboardView>');
    const importIdx = detail.indexOf("from '../components/CommentKeyboardView'");
    assert.ok(importIdx >= 0 && importIdx < useIdx);
  });

  it('el import coincide con PostDetail, que no crashea', () => {
    const line =
      "import { CommentKeyboardView } from '../components/CommentKeyboardView';";
    assert.ok(postDetail.includes(line));
    assert.ok(detail.includes(line));
    assert.match(keyboard, /export function CommentKeyboardView/);
  });

  it('el feed de cards no monta CommentKeyboardView (por eso las cards sí abren)', () => {
    assert.doesNotMatch(card, /CommentKeyboardView/);
  });

  it('crear alerta navega a AlertDetail con el id (mismo path que crasheaba)', () => {
    assert.match(create, /navigation\.replace\('AlertDetail', \{ alertId: alert\.id \}\)/);
  });

  it('/a/:id resuelve a AlertDetail tanto en linking como en appLinks', () => {
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/a/alert-1786333609808-mbelvr'), {
      screen: 'AlertDetail',
      params: { alertId: 'alert-1786333609808-mbelvr' },
    });
  });
});

describe('AlertDetail: alertas legacy con campos nuevos NULL', () => {
  it('LOST/SIGHTING/FOUND/ADOPTION activas no tiran con resolvedAt/sex NULL', () => {
    for (const type of ['lost', 'sighting', 'found', 'adoption'] as const) {
      const a = legacyAlert(type);
      assert.equal(isAlertResolved(a), false);
      assert.equal(typeof alertBadgeText(a), 'string');
      assert.equal(typeof alertBadgeColor(a), 'string');
      assert.equal(typeof alertContextLine(a), 'string');
      assert.ok(alertBadgeText(a).length > 0);
      assert.ok(alertContextLine(a).includes('lucasfuentes'));
    }
  });

  it('FOUND legacy muestra nota de resguardo; las demás no', () => {
    assert.equal(alertFoundSafeNote(legacyAlert('found')), 'Está resguardado');
    assert.equal(alertFoundSafeNote(legacyAlert('lost')), null);
    assert.equal(alertFoundSafeNote(legacyAlert('adoption')), null);
  });

  it('CTA de adopción tolera sex NULL', () => {
    assert.equal(adoptCtaLabel(legacyAlert('adoption').sex), 'Quiero adoptar');
    assert.equal(adoptCtaLabel(undefined), 'Quiero adoptar');
  });

  it('alerta resuelta legacy (solo resolvedAt) no tira', () => {
    const a = { ...legacyAlert('lost'), resolvedAt: 1786400000000, status: 'resolved' as const };
    assert.equal(isAlertResolved(a), true);
    assert.match(alertBadgeText(a), /YA APARECIÓ/);
  });
});
