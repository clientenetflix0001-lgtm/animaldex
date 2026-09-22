import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOG_BREED_CATALOG,
  parseBreedInput,
  persistableBreedId,
  suggestBreeds,
  breedBelongsToSpecies,
} from '../lib/breeds.ts';
import {
  LOST_BREED_MATCH_WINDOW_MINUTES,
  isActiveLostAlert,
  localitiesCompatible,
  lostBreedMatchActivityCopy,
  lostBreedMatchGroupKey,
  lostBreedMatchIdempotencyKey,
  lostBreedMatchNavData,
  lostBreedMatchPushCopy,
  lostFoundBreedMatch,
  pickLostBreedMatchTargets,
  shouldSkipSelfMatch,
} from '../lib/lostBreedMatch.ts';
import {
  CRON_DAILY,
  CRON_PUSH_FLUSH,
  PUSH_KIND,
  decidePushDelivery,
  pushBatchWindowMs,
  pushLevelForKind,
  scheduledJobKind,
  scheduledTasksForCron,
} from '../lib/pushCenter.ts';
import { mergeNotificationPrefs, parsePushNav, prefAllows, pushNavDestination } from '../lib/pushPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const pushBatches = readFileSync(join(root, 'worker/pushBatches.js'), 'utf8');
const createAlert = readFileSync(join(root, 'screens/CreateAlertScreen.tsx'), 'utf8');
const migration = readFileSync(join(root, 'migrations/017_pet_contact_breed_match.sql'), 'utf8');

const lost = {
  id: 'lost-1',
  userId: 'owner-1',
  type: 'lost',
  status: 'active',
  species: 'perro',
  breedId: 'poodle',
  locality: 'Salta Capital',
  placeId: 'AR:georef:66028050',
};

describe('razas controladas', () => {
  it('17. cani → Caniche', () => {
    assert.deepEqual(suggestBreeds('cani', 'perro').map((b) => b.id), ['poodle']);
    assert.equal(suggestBreeds('cani', 'perro')[0].label, 'Caniche');
  });

  it('18. poodle → Caniche', () => {
    assert.equal(suggestBreeds('poodle', 'perro')[0].id, 'poodle');
  });

  it('19. salchicha → Dachshund/Salchicha', () => {
    assert.equal(suggestBreeds('salchicha', 'perro')[0].id, 'dachshund');
    assert.equal(suggestBreeds('sal', 'perro')[0].id, 'dachshund');
    assert.equal(suggestBreeds('dach', 'perro')[0].id, 'dachshund');
  });

  it('20. no acepta typo como breed_id', () => {
    assert.deepEqual(parseBreedInput('canichee', 'perro'), { breedId: null, accepted: false });
    assert.deepEqual(parseBreedInput('canihe', 'perro'), { breedId: null, accepted: false });
    assert.equal(persistableBreedId('caniche toy', 'perro'), null);
    assert.equal(DOG_BREED_CATALOG.length, 10);
  });

  it('21. breed pertenece a species', () => {
    assert.equal(breedBelongsToSpecies('poodle', 'perro'), true);
    assert.equal(breedBelongsToSpecies('poodle', 'gato'), false);
    assert.equal(suggestBreeds('cani', 'gato').length, 0);
  });

  it('22. No sé → NULL', () => {
    assert.deepEqual(parseBreedInput('unknown', 'perro'), { breedId: null, accepted: true });
    assert.deepEqual(parseBreedInput('', 'perro'), { breedId: null, accepted: true });
    assert.match(createAlert, /BreedPicker/);
    assert.match(migration, /alerts ADD COLUMN breed_id TEXT/);
  });
});

describe('match lost ↔ found', () => {
  it('23. Lost Caniche + Found Caniche + misma localidad → match', () => {
    const found = { ...lost, id: 'found-1', userId: 'lucas', type: 'found' };
    assert.equal(lostFoundBreedMatch(lost, found), true);
  });

  it('24. Lost Labrador + Found Caniche → no match', () => {
    const found = { ...lost, id: 'found-1', userId: 'lucas', type: 'found', breedId: 'poodle' };
    assert.equal(lostFoundBreedMatch({ ...lost, breedId: 'labrador_retriever' }, found), false);
  });

  it('25. Lost Caniche + Found Caniche otra localidad → no match', () => {
    const found = { ...lost, id: 'found-1', userId: 'lucas', type: 'found', locality: 'Cafayate', placeId: 'AR:other' };
    assert.equal(lostFoundBreedMatch(lost, found), false);
    assert.equal(localitiesCompatible(lost, { locality: 'Cafayate', placeId: 'AR:other' }), false);
  });

  it('26. Lost cerrada → no match', () => {
    assert.equal(isActiveLostAlert({ ...lost, status: 'resolved', resolvedAt: 1 }), false);
    assert.equal(lostFoundBreedMatch({ ...lost, status: 'resolved', resolvedAt: 9 }, { ...lost, type: 'found', userId: 'x' }), false);
  });

  it('27. species diferente → no match', () => {
    const found = { ...lost, id: 'found-1', userId: 'lucas', type: 'found', species: 'gato' };
    assert.equal(lostFoundBreedMatch(lost, found), false);
  });

  it('28. actor recipient → no self push', () => {
    assert.equal(shouldSkipSelfMatch('owner-1', 'owner-1'), true);
    const found = { ...lost, id: 'found-1', type: 'found' };
    assert.deepEqual(pickLostBreedMatchTargets(found, [lost], 'owner-1'), []);
  });

  it('29. mismo found/lost no duplica', () => {
    const key = lostBreedMatchIdempotencyKey({ foundAlertId: 'f1', lostAlertId: 'l1', recipientUserId: 'u1' });
    assert.equal(key, 'lost_breed_match:f1:l1:u1');
    assert.match(worker, /INSERT OR IGNORE INTO activity_events/);
    assert.match(worker, /lostBreedMatchIdempotencyKey/);
  });

  it('30. Activity se genera/deriva', () => {
    const one = lostBreedMatchActivityCopy({ actorUsername: 'lucasfuentes', breedId: 'poodle' });
    assert.equal(one.body, 'lucasfuentes reportó un Caniche encontrado cerca de tu zona.');
    assert.match(worker, /type IN \('birthday'[\s\S]*lost_breed_match/);
  });

  it('31. push queda batch 60 min', () => {
    assert.equal(LOST_BREED_MATCH_WINDOW_MINUTES, 60);
    assert.equal(pushBatchWindowMs(PUSH_KIND.LOST_BREED_MATCH), 60 * 60_000);
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.LOST_BREED_MATCH, actorId: 'a', recipientId: 'b', now: 1 }).action, 'enqueue');
    assert.equal(pushLevelForKind(PUSH_KIND.LOST_BREED_MATCH), 'important');
  });

  it('32. varios encontrados se agrupan', () => {
    const many = lostBreedMatchPushCopy({ actorUsername: 'lucasfuentes', extraCount: 6, breedId: 'poodle' });
    assert.equal(many.title, 'Posibles coincidencias con tu mascota');
    assert.equal(many.body, 'lucasfuentes y 6 personas más reportaron Caniches encontrados cerca de tu zona.');
    assert.equal(
      lostBreedMatchGroupKey({ recipientUserId: 'u1', lostAlertId: 'lost-1', breedId: 'poodle', placeId: 'AR:georef:66028050' }),
      'lost_breed_match:u1:lost-1:poodle:place:AR:georef:66028050'
    );
  });

  it('33. cron */5 sigue SOLO flush', () => {
    assert.equal(scheduledJobKind(CRON_PUSH_FLUSH), 'push_flush');
    assert.deepEqual(scheduledTasksForCron(CRON_PUSH_FLUSH), ['flushDuePushBatches']);
    assert.match(worker, /scheduledJobKind\(event && event.cron\) === 'push_flush'/);
  });

  it('34. cron diario intacto', () => {
    assert.equal(CRON_DAILY, '0 11 * * *');
    assert.ok(scheduledTasksForCron(CRON_DAILY).includes('runPersonalPetBirthdays'));
    assert.doesNotMatch(worker, /recordLostBreedMatches\(env[\s\S]{0,80}scheduled/);
  });

  it('35. shareLocation sigue CRITICAL inmediato', () => {
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.LOCATION, actorId: 'a', recipientId: 'b', now: 1 }).action, 'immediate');
    assert.match(worker, /locationPushMessage/);
    assert.doesNotMatch(worker.slice(worker.indexOf("if (action === 'shareLocation')"), worker.indexOf("if (action === 'shareLocation')") + 2500), /ingestPushEvent/);
  });

  it('36. push individual → AlertDetail', () => {
    const nav = lostBreedMatchNavData({ foundAlertIds: ['found-1'], lostAlertId: 'lost-1', breedId: 'poodle' });
    assert.equal(nav.alertId, 'found-1');
    assert.deepEqual(parsePushNav({ type: 'lost_breed_match', alertId: 'found-1', url: '/a/found-1' }), {
      kind: 'alert',
      alertId: 'found-1',
    });
    assert.deepEqual(pushNavDestination({ type: 'lost_breed_match', alertId: 'found-1', url: '/a/found-1' }), {
      name: 'AlertDetail',
      params: { alertId: 'found-1' },
    });
  });

  it('37. push agrupado → Alertas', () => {
    const nav = lostBreedMatchNavData({
      foundAlertIds: ['f1', 'f2'],
      lostAlertId: 'lost-1',
      breedId: 'poodle',
      locality: 'Salta Capital',
    });
    assert.equal(nav.type, 'lost_breed_match_list');
    assert.equal(pushNavDestination({ type: 'lost_breed_match_list', breedId: 'poodle', url: '/alertas' })?.name, 'Tabs');
    assert.equal(prefAllows(mergeNotificationPrefs(null), 'lost_breed_match'), true);
    assert.equal(prefAllows(mergeNotificationPrefs({ lost_breed_match: 0 }), 'lost_breed_match'), false);
  });

  it('matching ocurre solo al crear found, no en feed', () => {
    assert.match(worker, /type === 'found' && breedId/);
    assert.match(worker, /recordLostBreedMatches/);
    assert.doesNotMatch(worker, /action === 'feed'[\s\S]{0,400}recordLostBreedMatches/);
    assert.match(pushBatches, /input.groupKey \|\| pushGroupKey/);
  });
});
