import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALERT_LOCATION_REFERENCE_D1_COLUMN,
  ALERT_LOCATION_REFERENCE_LABEL,
  ALERT_LOCATION_REFERENCE_MAX,
  ALERT_LOCATION_REFERENCE_PLACEHOLDER,
  alertGeoFieldsWithReference,
  flyerLocationWithReference,
  municipalityLocationLine,
  sanitizeAlertLocationReference,
} from '../lib/alertLocationReference.ts';
import { buildAlertFlyerData } from '../lib/alertFlyer.ts';
import { placeById } from '../lib/geoplace/catalog.ts';
import { placeDisplayName } from '../lib/geoplace/format.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const SALTA = 'AR:georef:66028050';

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
      locationReference: 'B° Tres Cerritos, cerca de la plaza',
    });
    assert.equal(fields.locality, 'Salta Capital');
    assert.equal(fields.placeId, SALTA);
    assert.doesNotMatch(fields.locality, /Tres Cerritos/);
    assert.doesNotMatch(fields.placeId, /Tres Cerritos/);
    assert.equal(fields.locationReference, 'B° Tres Cerritos, cerca de la plaza');
    assert.equal(municipalityLocationLine(fields.locality, fields.province), 'Salta Capital, Salta');
    assert.equal(
      flyerLocationWithReference(fields.locality, fields.province, fields.locationReference),
      'Salta Capital, Salta\nB° Tres Cerritos, cerca de la plaza'
    );
  });

  it('sin municipio la referencia no se convierte en ubicación', () => {
    assert.equal(flyerLocationWithReference(null, null, 'Villa Palacios'), undefined);
    assert.equal(sanitizeAlertLocationReference('   Av. San Martín   1200  '), 'Av. San Martín 1200');
    assert.equal(sanitizeAlertLocationReference('x'.repeat(200)).length, ALERT_LOCATION_REFERENCE_MAX);
  });

  it('el flyer muestra la referencia sin tocar locality del payload', () => {
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
  });

  it('la UI existe y createAlert no manda locationReference ni D1 nuevo', () => {
    const create = read('screens/CreateAlertScreen.tsx');
    const db = read('lib/db.ts');
    const worker = read('worker/index.js');
    const migrations = read('migrations/015_geo_place_identity.sql');
    assert.match(create, /ALERT_LOCATION_REFERENCE_LABEL/);
    assert.match(create, /ALERT_LOCATION_REFERENCE_PLACEHOLDER/);
    assert.match(create, /sanitizeAlertLocationReference\(locationReference\)/);
    const payload = create.slice(create.indexOf('const payload = {'), create.indexOf('if (flyerMode)'));
    assert.doesNotMatch(payload, /locationReference/);
    assert.doesNotMatch(create, /locality: `\$\{locality\}/);
    assert.doesNotMatch(create, /Salta Capital - /);
    const createAlert = db.slice(db.indexOf('createAlert:'));
    assert.doesNotMatch(createAlert.slice(0, 1800), /locationReference|location_reference|neighborhood/);
    assert.doesNotMatch(worker, /location_reference/);
    assert.doesNotMatch(migrations, /location_reference/);
    assert.equal(ALERT_LOCATION_REFERENCE_D1_COLUMN, 'location_reference TEXT');
    assert.equal(ALERT_LOCATION_REFERENCE_LABEL, 'Barrio, calle o referencia (opcional)');
    assert.match(ALERT_LOCATION_REFERENCE_PLACEHOLDER, /Tres Cerritos/);
  });
});
