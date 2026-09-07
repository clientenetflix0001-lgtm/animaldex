import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADOPTION_CONTACT_MISSING } from '../lib/adoptionContact.ts';
import { PROFILE_TYPE_BADGE, PROFILE_TYPE_LABEL } from '../features/profiles/profileTypes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const createAlert = readFileSync(join(root, 'screens/CreateAlertScreen.tsx'), 'utf8');
const alertDetail = readFileSync(join(root, 'screens/AlertDetailScreen.tsx'), 'utf8');
const alertsFeed = readFileSync(join(root, 'screens/AlertsScreen.tsx'), 'utf8');
const myAlerts = readFileSync(join(root, 'screens/MyAlertsScreen.tsx'), 'utf8');
const alertCard = readFileSync(join(root, 'components/AlertCard.tsx'), 'utf8');
const adoptionCard = readFileSync(join(root, 'components/AdoptionDiscoveryCard.tsx'), 'utf8');
const adoptionDiscovery = readFileSync(join(root, 'screens/AdoptionDiscoveryScreen.tsx'), 'utf8');
const adoptionContact = readFileSync(join(root, 'lib/adoptionContact.ts'), 'utf8');
const guestInvite = readFileSync(join(root, 'components/GuestInviteBar.tsx'), 'utf8');
const profileTypes = readFileSync(join(root, 'features/profiles/profileTypes.ts'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const alertsLib = readFileSync(join(root, 'lib/alerts.ts'), 'utf8');

function walkUiFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walkUiFiles(p, acc);
    else if (/\.(tsx|ts)$/.test(name.name)) acc.push(p);
  }
  return acc;
}

describe('copy de tipo de página: Bienestar Animal', () => {
  it('1. Alertas ya no muestra "Página de refugio"', () => {
    assert.match(createAlert, /Página de Bienestar Animal/);
    assert.doesNotMatch(createAlert, /Página de refugio/);
    assert.doesNotMatch(createAlert, /[Rr]efugio/);
    assert.doesNotMatch(alertDetail, /[Rr]efugio/);
    assert.doesNotMatch(alertsFeed, /[Rr]efugio/);
    assert.doesNotMatch(myAlerts, /[Rr]efugio/);
    assert.doesNotMatch(alertCard, /[Rr]efugio/);
    assert.doesNotMatch(alertsLib, /[Rr]efugio/);
  });

  it('2. Adoptar ya no muestra copy propio con "refugio"', () => {
    assert.equal(
      ADOPTION_CONTACT_MISSING,
      'Esta página de Bienestar Animal todavía no agregó un medio de contacto para solicitudes de adopción.'
    );
    assert.doesNotMatch(adoptionContact, /Este refugio/);
    assert.match(adoptionCard, /ADOPTION_CONTACT_MISSING/);
    assert.doesNotMatch(adoptionCard, /Este refugio/);
    assert.doesNotMatch(adoptionDiscovery, /[Rr]efugio/);
  });

  it('3. el copy visible de tipo de página dice Bienestar Animal', () => {
    assert.equal(PROFILE_TYPE_BADGE.protector, '❤️ Bienestar Animal');
    assert.equal(PROFILE_TYPE_LABEL.protector, 'Página de Bienestar Animal');
    assert.match(createAlert, /Bienestar Animal/);
    assert.match(guestInvite, /páginas de Bienestar Animal/);
    assert.doesNotMatch(guestInvite, /refugios y protectoras/);
  });

  it('4. los internos siguen usando protector', () => {
    assert.match(profileTypes, /export type ProfileType = 'personal' \| 'business' \| 'protector'/);
    assert.match(createAlert, /activeProfile\?\.type === 'protector'/);
    assert.match(adoptionContact, /type !== 'protector'/);
    assert.match(worker, /type === 'protector'/);
    assert.match(worker, /type = 'protector'/);
    assert.doesNotMatch(worker, /type = 'bienestar'/);
    assert.doesNotMatch(profileTypes, /type ProfileType = .*bienestar/);
  });

  it('5. el contenido de usuario no se transforma', () => {
    const uiRoots = ['screens', 'components', 'features', 'lib'].map((d) => join(root, d));
    const files = uiRoots.flatMap((d) => walkUiFiles(d));
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /\.replace\([^)]*[Rr]efugio/);
      assert.doesNotMatch(src, /replaceAll\([^)]*[Rr]efugio/);
    }
    assert.match(worker, /Esta mascota no pertenece a un refugio/);
    assert.match(worker, /Solo se pueden archivar mascotas de un refugio/);
  });

  it('6. no queda copy de tipo de página "Refugio" en UI Animaldex', () => {
    const uiFiles = [
      ...walkUiFiles(join(root, 'screens')),
      ...walkUiFiles(join(root, 'components')),
      ...walkUiFiles(join(root, 'features')),
    ];
    const leftovers: string[] = [];
    for (const file of uiFiles) {
      const src = readFileSync(file, 'utf8');
      const visible = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/[Rr]efugio/.test(visible) && !visible.includes("|| 'refugio'")) {
        leftovers.push(file.replace(root + '/', ''));
      }
    }
    assert.deepEqual(leftovers, []);
  });
});
