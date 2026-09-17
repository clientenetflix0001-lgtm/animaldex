import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALERT_LOCATION_REFERENCE_COLUMN,
  ALERT_LOCATION_REFERENCE_D1_COLUMN,
  ALERT_LOCATION_REFERENCE_LABEL,
  ALERT_LOCATION_REFERENCE_MAX,
  ALERT_LOCATION_REFERENCE_PLACEHOLDER,
  alertGeoFieldsWithReference,
  alertLocationDisplayLines,
  flyerLocationWithReference,
  municipalityLocationLine,
  persistableAlertLocationReference,
  sanitizeAlertLocationReference,
} from '../lib/alertLocationReference.ts';
import { buildAlertFlyerData, flyerFromApiAlert } from '../lib/alertFlyer.ts';
import { placeById } from '../lib/geoplace/catalog.ts';
import { placeDisplayName } from '../lib/geoplace/format.ts';
import { locationReferenceInsertFragment } from '../worker/alertLocationWrite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const SALTA = 'AR:georef:66028050';

function fakeEnv(db: DatabaseSync) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          all: async () => ({ results: db.prepare(sql).all() }),
        };
      },
    },
  } as any;
}

describe('Crear Alerta — referencia manual', () => {
  it('no mezcla la referencia con municipio ni placeId', () => {
    const salta = placeById(SALTA)!;
    const locality = placeDisplayName(salta);
    const fields = alertGeoFieldsWithReference({
      locality,
      province: salta.admin1Name,
      placeId: salta.placeId,
      admin1Code: salta.admin1Code,
      admin2Code: salta.admin2Code,
      lat: salta.centroidLat,
      lon: salta.centroidLng,
      locationReference: '  B° Tres Cerritos, cerca de la plaza  ',
    });
    assert.equal(fields.locality, 'Salta Capital');
    assert.equal(fields.placeId, SALTA);
    assert.doesNotMatch(fields.locality, /Tres Cerritos/);
    assert.doesNotMatch(fields.placeId, /Tres Cerritos/);
    assert.equal(fields.locationReference, 'B° Tres Cerritos, cerca de la plaza');
    assert.equal(municipalityLocationLine(fields.locality, fields.province), 'Salta Capital, Salta');
    assert.deepEqual(alertLocationDisplayLines(fields.locality, fields.locationReference), [
      'Salta Capital',
      'B° Tres Cerritos, cerca de la plaza',
    ]);
    assert.deepEqual(alertLocationDisplayLines(fields.locality, '   '), ['Salta Capital']);
  });

  it('trim, máximo 120 y vacío → null', () => {
    assert.equal(persistableAlertLocationReference('   Av. San Martín   1200  '), 'Av. San Martín 1200');
    assert.equal(persistableAlertLocationReference('   '), null);
    assert.equal(persistableAlertLocationReference(''), null);
    assert.equal(sanitizeAlertLocationReference('x'.repeat(200)).length, ALERT_LOCATION_REFERENCE_MAX);
    assert.equal(flyerLocationWithReference(null, null, 'Villa Palacios'), undefined);
  });

  it('el flyer muestra la referencia como segunda línea', () => {
    const flyer = buildAlertFlyerData({
      type: 'lost',
      locality: 'Salta Capital',
      province: 'Salta',
      locationReference: 'B° Tres Cerritos, cerca de la plaza',
    });
    assert.equal(flyer.location, 'Salta Capital, Salta\nB° Tres Cerritos, cerca de la plaza');
    const without = buildAlertFlyerData({
      type: 'lost',
      locality: 'Cerrillos',
      province: 'Salta',
    });
    assert.equal(without.location, 'Cerrillos, Salta');
    const fromApi = flyerFromApiAlert({
      id: 'a1',
      userId: 'u1',
      type: 'lost',
      status: 'active',
      petName: null,
      species: 'perro',
      breed: '',
      description: '',
      image: 'https://x',
      locality: 'Salta Capital',
      province: 'Salta',
      country: 'AR',
      lat: null,
      lon: null,
      locationReference: 'B° Tres Cerritos, cerca de la plaza',
      eventDate: null,
      createdAt: 1,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      username: null,
      userName: null,
      userAvatar: null,
    });
    assert.equal(fromApi.location, 'Salta Capital, Salta\nB° Tres Cerritos, cerca de la plaza');
  });

  it('createAlert persiste location_reference si la columna existe, sin GEO', async () => {
    const create = read('screens/CreateAlertScreen.tsx');
    const detail = read('screens/AlertDetailScreen.tsx');
    const db = read('lib/db.ts');
    const worker = read('worker/index.js');
    const migration = read('migrations/016_alert_location_reference.sql');
    const feed = read('screens/FeedScreen.tsx');
    const filter = read('worker/geoFilter.js');
    assert.match(create, /ALERT_LOCATION_REFERENCE_LABEL/);
    assert.match(create, /locationReference: reference \|\| null/);
    assert.match(detail, /alert\.locationReference/);
    assert.match(db, /locationReference\?: string \| null/);
    assert.match(worker, /locationReference: r\.location_reference \|\| null/);
    assert.match(worker, /locationReferenceInsertFragment/);
    assert.match(migration, /ALTER TABLE alerts ADD COLUMN location_reference TEXT/);
    assert.match(migration, /LOCAL ONLY/);
    assert.doesNotMatch(create, /Salta Capital - /);
    assert.doesNotMatch(worker, /location_reference = \?/);
    assert.doesNotMatch(filter, /location_reference/);
    assert.doesNotMatch(feed, /location_reference|locationReference/);
    assert.equal(ALERT_LOCATION_REFERENCE_COLUMN, 'location_reference');
    assert.equal(ALERT_LOCATION_REFERENCE_D1_COLUMN, 'location_reference TEXT');
    assert.equal(ALERT_LOCATION_REFERENCE_LABEL, 'Barrio, calle o referencia (opcional)');
    assert.match(ALERT_LOCATION_REFERENCE_PLACEHOLDER, /Tres Cerritos/);

    const legacy = new DatabaseSync(':memory:');
    legacy.exec('CREATE TABLE alerts (id TEXT PRIMARY KEY, locality TEXT)');
    const skip = await locationReferenceInsertFragment(fakeEnv(legacy), 'B° Tres Cerritos');
    assert.deepEqual(skip, { columns: '', placeholders: '', values: [] });
    legacy.close();

    const migrated = new DatabaseSync(':memory:');
    migrated.exec('CREATE TABLE alerts (id TEXT PRIMARY KEY, locality TEXT)');
    migrated.exec('ALTER TABLE alerts ADD COLUMN location_reference TEXT');
    const frag = await locationReferenceInsertFragment(fakeEnv(migrated), '  B° Tres Cerritos  ');
    assert.equal(frag.columns, ', location_reference');
    assert.deepEqual(frag.values, ['B° Tres Cerritos']);
    const empty = await locationReferenceInsertFragment(fakeEnv(migrated), '   ');
    assert.deepEqual(empty.values, []);
    migrated.close();
  });
});
