import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPO_PUSH_BATCH_MAX,
  assignPushToken,
  birthdayPushIdempotencyKey,
  birthdayPushMessage,
  chunkTokens,
  isExpoPushToken,
  locationPushIdempotencyKey,
  locationPushMessage,
  mergeNotificationPrefs,
  payloadHasSensitiveLocation,
  parsePushNav,
  prefAllows,
  tokensToDisableFromReceipts,
  tokensToDisableFromTickets,
} from '../lib/pushPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

describe('register token', () => {
  it('acepta ExpoPushToken y rechaza basura', () => {
    assert.equal(isExpoPushToken(TOKEN_A), true);
    assert.equal(isExpoPushToken('fcm-native-token'), false);
    assert.equal(isExpoPushToken(''), false);
  });

  it('inserta token único y lo reasigna de A a B', () => {
    const first = assignPushToken(null, {
      userId: 'u-lucas',
      expoPushToken: TOKEN_A,
      platform: 'android',
      deviceId: 'pixel-1',
      now: 1000,
      newId: 'ptok-1',
    });
    assert.equal(first.action, 'insert');
    assert.equal(first.row.userId, 'u-lucas');

    const same = assignPushToken(first.row, {
      userId: 'u-lucas',
      expoPushToken: TOKEN_A,
      platform: 'android',
      now: 2000,
      newId: 'ptok-2',
    });
    assert.equal(same.action, 'refresh');

    const switchUser = assignPushToken(first.row, {
      userId: 'u-otro',
      expoPushToken: TOKEN_A,
      platform: 'android',
      now: 3000,
      newId: 'ptok-3',
    });
    assert.equal(switchUser.action, 'reassign');
    assert.equal(switchUser.row.userId, 'u-otro');
    assert.equal(switchUser.row.enabled, true);
  });
});

describe('logout / prefs / no token', () => {
  it('unregister deshabilita y no borra Activity', () => {
    const store = readFileSync(join(root, 'lib/store.tsx'), 'utf8');
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    assert.match(store, /unregisterThen/);
    assert.match(worker, /unregisterPushToken/);
    assert.match(worker, /SET enabled = 0/);
    assert.doesNotMatch(worker, /DELETE FROM activity_events/);
  });

  it('sin permiso / sin token no se envía', () => {
    assert.equal(prefAllows(mergeNotificationPrefs(null), 'location'), true);
    assert.equal(isExpoPushToken(null), false);
  });

  it('preference location=false y birthday=false bloquean el envío', () => {
    const off = mergeNotificationPrefs({ location: 0, birthday: 0 });
    assert.equal(prefAllows(off, 'location'), false);
    assert.equal(prefAllows(off, 'birthday'), false);
    assert.equal(off.like, false);
    assert.equal(off.comment, true);
  });
});

describe('idempotency and payload', () => {
  it('birthday y location tienen claves canónicas', () => {
    assert.equal(birthdayPushIdempotencyKey('pet-1', 2026), 'push:birthday:pet-1:2026');
    assert.equal(locationPushIdempotencyKey('loc-9'), 'push:location:loc-9');
  });

  it('payload de ubicación no incluye coords ni PII', () => {
    const msg = locationPushMessage({
      token: TOKEN_A,
      petName: 'Luna',
      petId: 'pet-1787367172507-0yeh4c',
      shareId: 'loc-1',
    });
    assert.equal(msg.title, '📍 Nueva ubicación de Luna');
    assert.equal(payloadHasSensitiveLocation(msg), false);
    const data = msg.data as Record<string, unknown>;
    assert.equal(data.lat, undefined);
    assert.equal(data.lon, undefined);
    assert.equal(data.type, 'location');
    assert.equal(data.url, '/actividad');
  });

  it('payload de cumpleaños navega a PetProfile', () => {
    const msg = birthdayPushMessage({
      token: TOKEN_A,
      petName: 'Luna',
      petId: 'pet-1',
      petUsername: 'lunaqr13',
      years: 3,
    });
    assert.equal(msg.title, '🎂 ¡Hoy Luna cumple 3 años!');
    assert.deepEqual(parsePushNav(msg.data as never), { kind: 'pet', petId: 'lunaqr13' });
  });
});

describe('batch and receipts', () => {
  it('parte tokens de a 100', () => {
    const items = Array.from({ length: 205 }, (_, i) => i);
    const batches = chunkTokens(items);
    assert.equal(EXPO_PUSH_BATCH_MAX, 100);
    assert.equal(batches.length, 3);
    assert.equal(batches[0].length, 100);
    assert.equal(batches[2].length, 5);
  });

  it('DeviceNotRegistered deshabilita el token', () => {
    const deadTickets = tokensToDisableFromTickets(
      [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }],
      [TOKEN_A, TOKEN_B]
    );
    assert.deepEqual(deadTickets, [TOKEN_A]);

    const deadReceipts = tokensToDisableFromReceipts(
      { t1: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
      { t1: TOKEN_B }
    );
    assert.deepEqual(deadReceipts, [TOKEN_B]);
  });
});

describe('client cannot push to another user + web safe', () => {
  it('Worker no expone sendPushToUser y register usa la sesión', () => {
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
    assert.doesNotMatch(worker, /sendPushToUser/);
    assert.match(worker, /action === 'registerPushToken'/);
    assert.match(worker, /planned\.row\.userId/);
    assert.match(db, /registerPushToken/);
    const start = worker.indexOf("if (action === 'registerPushToken')");
    const before = worker.slice(0, start);
    assert.match(before, /const userId = await authUser/);
  });

  it('web degrada: no Service Worker push', () => {
    const push = readFileSync(join(root, 'lib/push.ts'), 'utf8');
    const appJson = readFileSync(join(root, 'app.json'), 'utf8');
    assert.match(push, /Platform\.OS === 'web'/);
    assert.doesNotMatch(push, /serviceWorker/);
    assert.match(appJson, /"version": "1.1.0"/);
    assert.match(appJson, /googleServicesFile/);
    assert.match(appJson, /pathPrefix": "\/p\//);
    assert.match(appJson, /pathAdvancedPattern/);
  });
});
