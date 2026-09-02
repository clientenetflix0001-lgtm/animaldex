import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALERT_RENEW_MS,
  ALERT_RESOLVED_NOT_RENEWABLE,
  alertActiveHeadline,
  alertBadgeText,
  alertContextLine,
  alertResolveActionLabel,
  alertResolvedHeadline,
  alertShareMeta,
  allowedResolutionForType,
  canRenewAlert,
  isAlertResolved,
  parseAlertType,
} from '../lib/alerts.ts';
import { isValidPetUsername } from '../lib/petHandles.ts';
import { parseProtectorAdoptionContact } from '../lib/adoptionContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const mine = readFileSync(join(root, 'screens/MyAlertsScreen.tsx'), 'utf8');
const create = readFileSync(join(root, 'screens/CreateAlertScreen.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/AlertCard.tsx'), 'utf8');
const detail = readFileSync(join(root, 'screens/AlertDetailScreen.tsx'), 'utf8');
const feed = readFileSync(join(root, 'screens/AlertsScreen.tsx'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const migration = readFileSync(join(root, 'migrations/007_alert_resolution.sql'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

describe('Mis alertas: acciones de resolución', () => {
  it('1. LOST activa muestra Ya apareció', () => {
    assert.equal(alertResolveActionLabel('lost'), 'Ya apareció');
    assert.match(mine, /alertResolveActionLabel\(item\.type, item\.sex\)/);
    assert.match(create, /cfg\.createLabel/);
  });

  it('2. SIGHTING activa muestra Encontró a su familia', () => {
    assert.equal(alertResolveActionLabel('sighting'), 'Encontró a su familia');
    assert.equal(parseAlertType('sighting'), 'sighting');
  });

  it('3. FOUND activa muestra Encontró a su familia', () => {
    assert.equal(alertResolveActionLabel('found'), 'Encontró a su familia');
    assert.equal(parseAlertType('found'), 'found');
  });

  it('4. ADOPTION muestra Ya fue adoptado/a', () => {
    assert.equal(alertResolveActionLabel('adoption', 'macho'), 'Ya fue adoptado');
    assert.equal(alertResolveActionLabel('adoption', 'hembra'), 'Ya fue adoptada');
    assert.equal(alertResolveActionLabel('adoption', null), 'Ya fue adoptado/a');
  });
});

describe('servidor: resolver alerta', () => {
  it('5–8. resolution_type según tipo original', () => {
    assert.equal(allowedResolutionForType('lost'), 'found');
    assert.equal(allowedResolutionForType('sighting'), 'reunited');
    assert.equal(allowedResolutionForType('found'), 'reunited');
    assert.equal(allowedResolutionForType('adoption'), 'adopted');
    const resolve = action('resolveAlert');
    assert.match(resolve, /allowedResolutionForType\(owned\[0\]\.type\)/);
    assert.match(resolve, /resolution_type = \?/);
    assert.match(resolve, /status = 'resolved'/);
  });

  it('9. otro usuario no puede resolver', () => {
    const resolve = action('resolveAlert');
    assert.match(resolve, /owned\[0\]\.user_id !== userId/);
    assert.match(resolve, /ALERT_RESOLVE_OWNER_ERROR/);
  });

  it('10. tipo de resolution incorrecto rechazado', () => {
    const resolve = action('resolveAlert');
    assert.match(resolve, /requested && requested !== allowed/);
    assert.match(resolve, /ALERT_RESOLVE_TYPE_ERROR/);
  });

  it('11. resolved_at se asigna', () => {
    assert.match(action('resolveAlert'), /resolved_at = \?/);
    assert.match(migration, /ALTER TABLE alerts ADD COLUMN resolved_at INTEGER/);
    assert.match(migration, /LOCAL ONLY/);
  });

  it('12. misma alert.id', () => {
    const resolve = action('resolveAlert');
    assert.match(resolve, /WHERE id = \?/);
    assert.doesNotMatch(resolve, /INSERT INTO alerts/);
    assert.doesNotMatch(resolve, /DELETE FROM alerts/);
  });

  it('13. no se borra publicación', () => {
    const resolve = action('resolveAlert');
    assert.doesNotMatch(resolve, /DELETE FROM alert_likes/);
    assert.doesNotMatch(resolve, /DELETE FROM alert_comments/);
    assert.doesNotMatch(resolve, /DELETE FROM alerts/);
  });

  it('14. likes/comments intactos', () => {
    const resolve = action('resolveAlert');
    assert.doesNotMatch(resolve, /alert_likes/);
    assert.doesNotMatch(resolve, /alert_comments/);
    assert.match(action('alertDetail'), /ALERT_SELECT\} WHERE a\.id = \?/);
    assert.doesNotMatch(action('alertDetail'), /resolved_at IS NULL/);
  });
});

describe('renovación y feed', () => {
  it('15. resuelta no puede renovarse', () => {
    const resolved = { status: 'resolved' as const, resolvedAt: 1, createdAt: 1, renewedAt: 1 };
    assert.equal(canRenewAlert(resolved, Date.now()), false);
    assert.match(mine, /Renovar publicación/);
    assert.match(mine, /!resolved \?/);
    assert.match(mine, />Resuelta</);
  });

  it('16. endpoint renew rechaza resuelta', () => {
    const renew = action('renewAlert');
    assert.match(renew, /ALERT_RESOLVED_NOT_RENEWABLE/);
    assert.match(renew, /ALERT_RENEW_MS/);
    assert.equal(ALERT_RESOLVED_NOT_RENEWABLE.includes('resuelta'), true);
    assert.equal(ALERT_RENEW_MS, 7 * 24 * 60 * 60 * 1000);
  });

  it('17. feed activo no muestra resueltas', () => {
    const feedAct = action('alertsFeed');
    assert.match(feedAct, /a\.resolved_at IS NULL/);
    assert.match(feedAct, /a\.status = 'active'/);
    assert.match(feedAct, /COALESCE\(a\.renewed_at, a\.created_at\)/);
  });

  it('18. Mis alertas Activas la deja de mostrar', () => {
    const mineAct = action('myAlerts');
    assert.match(mineAct, /tab === 'resolved'/);
    assert.match(mineAct, /a\.resolved_at IS NULL/);
  });

  it('19. Mis alertas Resueltas sí la muestra', () => {
    const mineAct = action('myAlerts');
    assert.match(mineAct, /a\.status = 'resolved' OR a\.resolved_at IS NOT NULL/);
    assert.match(mine, /switchTab\('resolved'\)/);
    assert.match(mine, /Resueltas/);
  });
});

describe('encabezado, CTA y URL pública', () => {
  it('20. encabezado LOST → YA APARECIÓ', () => {
    assert.match(alertResolvedHeadline({ type: 'lost', petName: 'Nina' }), /NINA YA APARECIÓ/);
    assert.equal(alertBadgeText({ type: 'lost', status: 'resolved', petName: 'Nina' }).includes('YA APARECIÓ'), true);
    assert.match(card, /alertBadgeText\(alert\)/);
    assert.match(detail, /alertBadgeText\(alert\)/);
  });

  it('21. FOUND/SIGHTING → ENCONTRÓ A SU FAMILIA', () => {
    assert.match(alertResolvedHeadline({ type: 'found' }), /ENCONTRÓ A SU FAMILIA/);
    assert.match(alertResolvedHeadline({ type: 'sighting' }), /ENCONTRÓ A SU FAMILIA/);
  });

  it('22. ADOPTION → YA FUE ADOPTADO/A', () => {
    assert.match(alertResolvedHeadline({ type: 'adoption', petName: 'Good', sex: 'hembra' }), /GOOD YA FUE ADOPTADA/);
    assert.match(alertResolvedHeadline({ type: 'adoption', sex: 'macho' }), /YA FUE ADOPTADO/);
  });

  it('23. CTA Difundir activo desaparece/ajusta al resolver', () => {
    assert.match(detail, /resolved \?/);
    assert.match(detail, /DIFUNDIR/);
    assert.match(card, /resolved \?/);
    assert.match(card, /DIFUNDIR/);
  });

  it('24. Quiero adoptar desaparece al resolver', () => {
    assert.match(detail, /alert\.type === 'adoption' && !resolved/);
    assert.match(detail, /WantToAdoptButton/);
    assert.doesNotMatch(detail, /db\.adoptionContact/);
  });

  it('25. URL /a/:id sigue funcionando', () => {
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
    assert.match(action('alertDetail'), /WHERE a\.id = \?/);
    assert.doesNotMatch(action('alertDetail'), /404.*resuelta/);
  });
});

describe('metadata OG y delete secundario', () => {
  it('26. metadata LOST resuelta', () => {
    const meta = alertShareMeta({ type: 'lost', status: 'resolved', petName: 'Nina', username: 'lucasfuentes' });
    assert.equal(meta.title, '✅ Nina ya apareció');
    assert.match(meta.description, /volvió a casa/);
    assert.doesNotMatch(meta.title, /Ayudá a encontrar/);
    assert.match(pages, /Nina ya apareció|ya apareció/);
  });

  it('27. metadata FOUND/SIGHTING resuelta', () => {
    const meta = alertShareMeta({ type: 'found', status: 'resolved', username: 'lucasfuentes' });
    assert.equal(meta.title, '💚 Esta mascota encontró a su familia');
    assert.match(pages, /encontró a su familia/);
  });

  it('28. metadata ADOPTION resuelta', () => {
    const meta = alertShareMeta({ type: 'adoption', status: 'resolved', petName: 'Good', username: 'apansalta', sex: 'hembra' });
    assert.equal(meta.title, '💜 Good ya fue adoptada');
    assert.match(meta.description, /apansalta/);
  });

  it('29. foto OG intacta', () => {
    assert.match(pages, /image: a\.image/);
    assert.match(pages, /url: `\$\{origin\}\/a\/\$\{a\.id\}`/);
  });

  it('30. delete real sigue disponible secundariamente', () => {
    assert.match(mine, /ellipsis-vertical/);
    assert.match(mine, /Eliminar publicación/);
    assert.match(action('deleteAlert'), /DELETE FROM alerts WHERE id = \?/);
    assert.match(db, /action: 'deleteAlert'/);
    assert.doesNotMatch(mine, /Eliminar alerta/);
  });
});

describe('contexto, tipos y no-regresión', () => {
  it('username sin @ y contexto original', () => {
    assert.equal(alertContextLine({ type: 'lost', username: 'lucasfuentes', petName: 'Nina' }), 'lucasfuentes perdió a Nina');
    assert.match(alertContextLine({ type: 'found', username: 'lucasfuentes', species: 'perro' }), /encontró un perro/);
    assert.match(card, /alertContextLine\(alert\)/);
    assert.doesNotMatch(card, /@\{alert\.username\}/);
  });

  it('tipos parseados y headline activo', () => {
    assert.equal(parseAlertType('sighting'), 'sighting');
    assert.equal(parseAlertType('nope'), null);
    assert.match(alertActiveHeadline('lost'), /MASCOTA PERDIDA/);
    assert.match(create, /ALERT_TYPE_IDS/);
    assert.match(action('createAlert'), /parseAlertType\(body\.type\)/);
  });

  it('.pet y contacto de adopción intactos', () => {
    assert.equal(isValidPetUsername('nina.pet'), true);
    assert.equal(parseProtectorAdoptionContact('business', '', '').ok, true);
    assert.equal(isAlertResolved({ status: 'active' }), false);
    assert.equal(isAlertResolved({ status: 'resolved', resolvedAt: 1 }), true);
  });

  it('Mis alertas y renovación están cableados', () => {
    assert.match(feed, /Mis alertas/);
    assert.match(app, /MyAlerts/);
    assert.match(db, /action: 'myAlerts'/);
    assert.match(db, /action: 'renewAlert'/);
    assert.match(db, /action: 'resolveAlert'/);
  });
});
