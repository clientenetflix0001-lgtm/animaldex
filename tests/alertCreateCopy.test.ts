import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALERT_CREATE_PRIMARY,
  ALERT_RENEW_MS,
  ALERT_SIGHTING_SUBCHOICES,
  alertContextLine,
  alertFoundSafeNote,
  alertListTime,
  alertNeedsRenewalNotice,
  alertRenewalPushCopy,
  alertRenewalUi,
  alertShareMeta,
  alertSpeciesIndefinite,
  alertSpeciesNoun,
  alertTypeFromCreatePrimary,
  canRenewAlert,
  myAlertPrimaryLabel,
  myAlertSecondaryLine,
} from '../lib/alerts.ts';
import { isValidPetUsername } from '../lib/petHandles.ts';
import { parseProtectorAdoptionContact, resolveAdoptionOpenAction } from '../lib/adoptionContact.ts';
import { parsePushNav, pushNavDestination, prefAllows, mergeNotificationPrefs } from '../lib/pushPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const create = readFileSync(join(root, 'screens/CreateAlertScreen.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/AlertCard.tsx'), 'utf8');
const detail = readFileSync(join(root, 'screens/AlertDetailScreen.tsx'), 'utf8');
const feed = readFileSync(join(root, 'screens/AlertsScreen.tsx'), 'utf8');
const mine = readFileSync(join(root, 'screens/MyAlertsScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const share = readFileSync(join(root, 'lib/share.ts'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const migration = readFileSync(join(root, 'migrations/008_alert_renewal_contact.sql'), 'utf8');
const reels = readFileSync(join(root, 'lib/reels.ts'), 'utf8');
const discovery = readFileSync(join(root, 'lib/adoptionDiscovery.ts'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

describe('CREATE UI', () => {
  it('1. muestra exactamente 3 opciones principales', () => {
    assert.equal(ALERT_CREATE_PRIMARY.length, 3);
    assert.deepEqual(ALERT_CREATE_PRIMARY.map((x) => x.label), [
      'Perdí a mi mascota',
      'Vi o encontré una mascota',
      'Dar una mascota en adopción',
    ]);
    assert.match(create, /ALERT_CREATE_PRIMARY\.map/);
    assert.doesNotMatch(create, /ALERT_TYPE_IDS\.map/);
    assert.doesNotMatch(create, /Animal perdido/);
    assert.doesNotMatch(create, /Animal encontrado/);
  });

  it('2. LOST selecciona LOST', () => {
    assert.equal(alertTypeFromCreatePrimary('lost', null), 'lost');
    assert.equal(ALERT_CREATE_PRIMARY[0].type, 'lost');
    assert.equal(ALERT_CREATE_PRIMARY[0].color, '#E0483E');
  });

  it('3. Vi/Encontré abre subselector', () => {
    assert.equal(alertTypeFromCreatePrimary('seen-or-found', null), null);
    assert.match(create, /¿Qué pasó\?/);
    assert.match(create, /primary === 'seen-or-found'/);
    assert.equal(ALERT_SIGHTING_SUBCHOICES.length, 2);
  });

  it('4. La vi → SIGHTING', () => {
    assert.equal(ALERT_SIGHTING_SUBCHOICES[0].type, 'sighting');
    assert.equal(ALERT_SIGHTING_SUBCHOICES[0].label, 'La vi');
    assert.equal(alertTypeFromCreatePrimary('seen-or-found', 'sighting'), 'sighting');
  });

  it('5. La encontré → FOUND', () => {
    assert.equal(ALERT_SIGHTING_SUBCHOICES[1].type, 'found');
    assert.equal(ALERT_SIGHTING_SUBCHOICES[1].label, 'La encontré y está conmigo');
    assert.equal(alertTypeFromCreatePrimary('seen-or-found', 'found'), 'found');
  });

  it('6. ADOPTION → ADOPTION', () => {
    assert.equal(alertTypeFromCreatePrimary('adoption', null), 'adoption');
    assert.equal(ALERT_CREATE_PRIMARY[2].color, '#A94CF4');
    assert.match(action('createAlert'), /parseAlertType\(body\.type\)/);
  });
});

describe('CARDS ACTIVAS', () => {
  it('7. LOST con nombre', () => {
    assert.equal(
      alertContextLine({ type: 'lost', username: 'lucasfuentes', petName: 'Nina' }),
      'lucasfuentes perdió a Nina'
    );
  });

  it('8. LOST sin nombre usa especie', () => {
    assert.equal(
      alertContextLine({ type: 'lost', username: 'lucasfuentes', species: 'perro' }),
      'lucasfuentes perdió a su perro'
    );
    assert.equal(
      alertContextLine({ type: 'lost', username: 'lucasfuentes', species: 'gato' }),
      'lucasfuentes perdió a su gato'
    );
  });

  it('9. Otro → mascota', () => {
    assert.equal(alertSpeciesNoun('otro'), 'mascota');
    assert.equal(
      alertContextLine({ type: 'lost', username: 'lucasfuentes', species: 'otro' }),
      'lucasfuentes perdió a su mascota'
    );
    assert.equal(alertSpeciesIndefinite('otro'), 'una mascota');
  });

  it('10. SIGHTING', () => {
    assert.equal(
      alertContextLine({ type: 'sighting', username: 'lucasfuentes', species: 'perro' }),
      'lucasfuentes vio un perro'
    );
    assert.equal(
      alertContextLine({ type: 'sighting', username: 'lucasfuentes', species: 'otro' }),
      'lucasfuentes vio una mascota'
    );
  });

  it('11. FOUND + está resguardado', () => {
    assert.equal(
      alertContextLine({ type: 'found', username: 'lucasfuentes', species: 'perro' }),
      'lucasfuentes encontró un perro'
    );
    assert.equal(alertFoundSafeNote({ type: 'found', status: 'active' }), 'Está resguardado');
    assert.equal(alertFoundSafeNote({ type: 'found', status: 'resolved' }), null);
    assert.match(card, /alertFoundSafeNote\(alert\)/);
  });

  it('12. ADOPTION', () => {
    assert.equal(
      alertContextLine({ type: 'adoption', username: 'apansalta', petName: 'Good' }),
      'apansalta publicó a Good en adopción'
    );
    assert.equal(
      alertContextLine({ type: 'adoption', username: 'lucasfuentes' }),
      'lucasfuentes publicó una mascota en adopción'
    );
  });

  it('13. username sin @', () => {
    assert.equal(
      alertContextLine({ type: 'lost', username: '@lucasfuentes', petName: 'Nina' }),
      'lucasfuentes perdió a Nina'
    );
    assert.doesNotMatch(card, /@\{alert\.username\}/);
  });

  it('14. avatar', () => {
    assert.match(card, /userFallbackAvatar\(alert\.username/);
    assert.match(card, /styles\.avatar/);
    assert.match(detail, /styles\.avatar/);
  });
});

describe('META ACTIVA', () => {
  it('15. LOST nombre', () => {
    const meta = alertShareMeta({
      type: 'lost',
      username: 'lucasfuentes',
      petName: 'Nina',
      species: 'perro',
      locality: 'Salta Capital',
    });
    assert.equal(meta.title, '🚨 Ayudá a lucasfuentes a encontrar a Nina');
    assert.match(meta.description, /Se perdió su perro en Salta Capital/);
    assert.equal(meta.shareText, meta.title);
  });

  it('16. LOST sin nombre / otro', () => {
    const dog = alertShareMeta({ type: 'lost', username: 'lucasfuentes', species: 'perro', locality: 'Salta Capital' });
    assert.equal(dog.title, '🚨 Ayudá a lucasfuentes a encontrar a su perro');
    const other = alertShareMeta({ type: 'lost', username: 'lucasfuentes', species: 'otro' });
    assert.equal(other.title, '🚨 Ayudá a lucasfuentes a encontrar a su mascota');
  });

  it('17. SIGHTING', () => {
    const meta = alertShareMeta({
      type: 'sighting',
      username: 'lucasfuentes',
      species: 'perro',
      locality: 'Salta Capital',
    });
    assert.equal(meta.title, '👀 lucasfuentes vio un perro en Salta Capital');
    assert.match(meta.description, /¿Lo reconocés\?/);
  });

  it('18. FOUND', () => {
    const meta = alertShareMeta({
      type: 'found',
      username: 'lucasfuentes',
      species: 'perro',
      locality: 'Salta Capital',
    });
    assert.equal(meta.title, '🟢 lucasfuentes encontró un perro en Salta Capital');
    assert.match(meta.description, /El animal está resguardado/);
  });

  it('19. ADOPTION', () => {
    const named = alertShareMeta({
      type: 'adoption',
      username: 'apansalta',
      petName: 'Good',
      locality: 'Salta Capital',
    });
    assert.equal(named.title, '💜 Good está buscando una familia');
    assert.match(named.description, /apansalta publicó a Good en adopción en Salta Capital/);
    const unnamed = alertShareMeta({ type: 'adoption', username: 'apansalta' });
    assert.equal(unnamed.title, '💜 apansalta publicó una mascota en adopción');
    assert.doesNotMatch(named.description, /\+\d|whatsapp|teléfono/i);
  });

  it('20. imagen OG', () => {
    assert.match(pages, /image: a\.image/);
  });

  it('21. ubicación en metadata activa', () => {
    assert.match(pages, /Ayudá a \$\{user\} a encontrar a \$\{name\}/);
    assert.match(pages, /vio \$\{indef\}\$\{inLoc\}/);
    assert.match(pages, /encontró \$\{indef\}\$\{inLoc\}/);
  });

  it('22. URL /a/:id', () => {
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
    assert.match(pages, /url: `\$\{origin\}\/a\/\$\{a\.id\}`/);
    assert.match(share, /alertShareUrl/);
    assert.match(share, /meta\.shareText/);
    assert.doesNotMatch(pages, /\/lost\/|\/sighting\/|\/found\//);
  });
});

describe('MIS ALERTAS', () => {
  it('23. botón visible bajo Crear alerta', () => {
    const createIdx = feed.indexOf('Crear alerta');
    const mineIdx = feed.indexOf('Mis alertas');
    assert.ok(createIdx > 0 && mineIdx > createIdx);
    assert.doesNotMatch(feed, /titleActions/);
  });

  it('24. thumbnail', () => {
    assert.match(mine, /styles\.thumb/);
    assert.match(mine, /thumb\(item\.image/);
  });

  it('25. listado compacto', () => {
    assert.equal(myAlertPrimaryLabel({ type: 'lost', status: 'active' }), '🚨 Perdí a mi mascota');
    assert.equal(myAlertSecondaryLine({ petName: 'Nina', species: 'perro' }), 'Nina · Perro');
    assert.match(mine, /myAlertPrimaryLabel\(item\)/);
    assert.match(mine, /myAlertSecondaryLine\(item\)/);
    assert.doesNotMatch(mine, /AlertCard/);
  });

  it('26. Activas', () => {
    assert.match(mine, /switchTab\('active'\)/);
    assert.match(mine, />Activas</);
    assert.match(mine, /alertRenewalUi\(item\)/);
  });

  it('27. Resueltas', () => {
    assert.match(mine, /switchTab\('resolved'\)/);
    assert.match(mine, />Resueltas</);
    assert.match(mine, /timestampToDateString\(item\.resolvedAt\)/);
    assert.match(mine, /!resolved \?/);
  });
});

describe('RENOVACIÓN', () => {
  it('28. orden del feed usa renewed_at', () => {
    const feedAct = action('alertsFeed');
    assert.match(feedAct, /ORDER BY COALESCE\(a\.renewed_at, a\.created_at\) DESC/);
    assert.match(feedAct, /a\.resolved_at IS NULL/);
  });

  it('29. aviso una vez al día 7', () => {
    const now = 1_800_000_000_000;
    const created = now - ALERT_RENEW_MS;
    assert.equal(
      alertNeedsRenewalNotice({ status: 'active', createdAt: created, renewedAt: null, renewalNotifiedAt: null }, now),
      true
    );
    assert.equal(alertRenewalPushCopy({ type: 'lost', petName: 'Nina' }).title, '🚨 Tu alerta puede renovarse');
    assert.match(alertRenewalPushCopy({ type: 'lost', petName: 'Nina' }).body, /alerta de Nina/);
    assert.match(worker, /runAlertRenewalReminders/);
    assert.match(worker, /scheduled\(/);
  });

  it('30. no aviso duplicado', () => {
    const now = 1_800_000_000_000;
    const created = now - ALERT_RENEW_MS - 1000;
    assert.equal(
      alertNeedsRenewalNotice({
        status: 'active',
        createdAt: created,
        renewedAt: null,
        renewalNotifiedAt: created + ALERT_RENEW_MS,
      }, now),
      false
    );
    assert.match(worker, /alertRenewalPushIdempotencyKey/);
    assert.match(worker, /renewal_notified_at/);
  });

  it('31. renovar inicia ciclo nuevo', () => {
    const created = 1000;
    const renewed = created + ALERT_RENEW_MS;
    const now = renewed + 1000;
    assert.equal(
      alertNeedsRenewalNotice({
        status: 'active',
        createdAt: created,
        renewedAt: renewed,
        renewalNotifiedAt: created + ALERT_RENEW_MS,
      }, now),
      false
    );
    const later = renewed + ALERT_RENEW_MS;
    assert.equal(
      alertNeedsRenewalNotice({
        status: 'active',
        createdAt: created,
        renewedAt: renewed,
        renewalNotifiedAt: null,
      }, later),
      true
    );
    assert.match(action('renewAlert'), /renewal_notified_at = NULL/);
    const due = alertRenewalUi({ status: 'active', createdAt: now - 1000, renewedAt: now - 1000 }, now);
    assert.equal(due.canRenew, false);
    assert.match(due.label, /Renovable en|Podés renovar/);
    const ready = alertRenewalUi({ status: 'active', createdAt: now - ALERT_RENEW_MS, renewedAt: now - ALERT_RENEW_MS }, now);
    assert.equal(ready.canRenew, true);
    assert.equal(ready.label, 'Renovar publicación');
  });

  it('32. resuelta no recibe aviso ni renew', () => {
    const now = Date.now();
    assert.equal(
      alertNeedsRenewalNotice({ status: 'resolved', resolvedAt: 1, createdAt: 1, renewedAt: 1 }, now),
      false
    );
    assert.equal(canRenewAlert({ status: 'resolved', resolvedAt: 1, createdAt: 1, renewedAt: 1 }, now), false);
    assert.match(action('renewAlert'), /ALERT_RESOLVED_NOT_RENEWABLE/);
    assert.match(worker, /resolved_at IS NULL/);
  });
});

describe('ADOPTION CONTACT', () => {
  it('33–35. protector WhatsApp / teléfono / prioridad', () => {
    const contact = action('alertAdoptionContact');
    assert.match(contact, /type = 'protector'/);
    assert.match(contact, /adoption_whatsapp/);
    assert.match(contact, /adoption_phone/);
    const wa = resolveAdoptionOpenAction({
      whatsapp: '+5493875551234',
      phone: '+5493879990000',
      petName: 'Good',
      inquiryUrl: 'https://animaldex-web.pages.dev/a/alert-1',
    });
    assert.equal(wa.kind, 'whatsapp');
    const tel = resolveAdoptionOpenAction({
      whatsapp: null,
      phone: '+5493879990000',
      petName: 'Good',
    });
    assert.equal(tel.kind, 'tel');
    assert.match(create, /isProtectorAdoption/);
  });

  it('36. usuario personal ADOPTION tiene mecanismo de contacto', () => {
    const parsed = parseProtectorAdoptionContact('protector', '+5493875551234', '');
    assert.equal(parsed.ok, true);
    assert.match(action('createAlert'), /contact_whatsapp/);
    assert.match(action('createAlert'), /ADOPTION_CONTACT_REQUIRED/);
    assert.match(create, /needsPersonalContact/);
    assert.match(db, /action: 'alertAdoptionContact'/);
    assert.doesNotMatch(action('alertsFeed'), /contact_whatsapp/);
    assert.doesNotMatch(action('alertsFeed'), /contactWhatsapp/);
    assert.match(functionAlertRow(), /authorProfileId/);
    assert.doesNotMatch(functionAlertRow(), /contactWhatsapp|contact_whatsapp/);
    assert.match(migration, /LOCAL ONLY/);
    assert.match(migration, /contact_whatsapp/);
  });
});

describe('REGRESIÓN', () => {
  it('37. resolución existente intacta', () => {
    assert.match(action('resolveAlert'), /status = 'resolved'/);
    assert.match(mine, /alertResolveActionLabel/);
  });

  it('38. metadata resuelta intacta', () => {
    const meta = alertShareMeta({ type: 'lost', status: 'resolved', petName: 'Nina', username: 'lucasfuentes' });
    assert.equal(meta.title, '✅ Nina ya apareció');
    assert.match(pages, /Nina ya apareció|ya apareció/);
  });

  it('39. .pet intacto', () => {
    assert.equal(isValidPetUsername('nina.pet'), true);
  });

  it('40. Reels intacto', () => {
    assert.match(reels, /playback/);
  });

  it('41. AdoptionDiscovery intacto', () => {
    assert.match(discovery, /adoptionCardFromProtectorPet/);
    assert.match(discovery, /matchesAdoptionFilters/);
  });

  it('share y push de renovación', () => {
    assert.match(share, /meta\.shareText \|\| meta\.title/);
    assert.equal(prefAllows(mergeNotificationPrefs(null), 'lost_pet'), true);
    assert.equal(prefAllows(mergeNotificationPrefs(null), 'adoption'), true);
    assert.deepEqual(parsePushNav({ type: 'alert_renew', alertId: 'alert-1', url: '/a/alert-1' }), {
      kind: 'alert',
      alertId: 'alert-1',
    });
    assert.deepEqual(pushNavDestination({ type: 'alert_renew', url: '/a/alert-9' }), {
      name: 'AlertDetail',
      params: { alertId: 'alert-9' },
    });
    assert.match(alertListTime(Date.now() - 5 * 24 * 60 * 60 * 1000), /hace 5 días/);
  });
});

function functionAlertRow(): string {
  const start = worker.indexOf('function alertRow(');
  const next = worker.indexOf('const ALERT_SELECT', start);
  return worker.slice(start, next);
}
