import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { placeById } from '../lib/geoplace/catalog.ts';
import { placeDisplayName } from '../lib/geoplace/format.ts';
import { resolutionFromGeocode } from '../lib/geoplace/fromGeocode.ts';
import { unambiguousPlace } from '../lib/placeResolution.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const CERRILLOS_ID = 'AR:georef:66035010';
const SALTA_ID = 'AR:georef:66028050';
const MERCED_ID = 'AR:georef:66035020';

function resolved(hint: Parameters<typeof resolutionFromGeocode>[0]) {
  const res = resolutionFromGeocode(hint);
  return { res, place: unambiguousPlace(res) };
}

describe('detección GEO por reverse geocode + catálogo', () => {
  it('Cerrillos → Cerrillos, con el placeId oficial de San José de los Cerrillos', () => {
    const { res, place } = resolved({ city: 'Cerrillos', region: 'Salta' });
    assert.equal(res.source, 'device-geocode');
    assert.equal(res.requiresConfirmation, false);
    assert.equal(place?.placeId, CERRILLOS_ID);
    assert.equal(place?.localityName, 'San José de los Cerrillos');
    assert.equal(placeDisplayName(place!), 'Cerrillos');
  });

  it('Salta + Salta → Salta Capital, sin duplicar identidad', () => {
    const { place } = resolved({ city: 'Salta', region: 'Salta' });
    assert.equal(place?.placeId, SALTA_ID);
    assert.equal(place?.localityName, 'Salta');
    assert.equal(placeDisplayName(place!), 'Salta Capital');
    assert.equal(placeById(SALTA_ID)?.placeId, SALTA_ID);
  });

  it('municipio disponible tiene prioridad sobre el departamento', () => {
    const { place } = resolved({ city: 'La Merced', subregion: 'Cerrillos', region: 'Salta' });
    assert.equal(place?.placeId, MERCED_ID);
    assert.equal(placeDisplayName(place!), 'La Merced');
  });

  it('sin municipio se usa el departamento', () => {
    const { place } = resolved({ city: null, subregion: 'Cerrillos', region: 'Salta' });
    assert.equal(place?.placeId, CERRILLOS_ID);
    assert.equal(placeDisplayName(place!), 'Cerrillos');
  });

  it('reverse geocode vacío no inventa un lugar', () => {
    const { res, place } = resolved({ city: null, subregion: null, region: null });
    assert.equal(place, null);
    assert.equal(res.candidates.length, 0);
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.reason, 'no-candidates');
  });

  it('no convierte barrios ni urbanizaciones en ubicación territorial', () => {
    const palmas = resolved({ city: 'Las Palmas', region: 'Salta' });
    assert.equal(palmas.place?.placeId, CERRILLOS_ID);
    assert.equal(placeDisplayName(palmas.place!), 'Cerrillos');

    const barrio = resolved({ city: 'Salta', subregion: 'Capital', region: 'Salta' });
    assert.equal(barrio.place?.placeId, SALTA_ID);
    assert.doesNotMatch(placeDisplayName(barrio.place!), /Tres Cerritos|Las Palmas|Terrazas/i);
  });

  it('el camino de detección usa reverseGeocodeAsync y no llama a /geo', () => {
    const locate = read('lib/placeLocate.ts');
    assert.match(locate, /reverseGeocodeAsync/);
    assert.doesNotMatch(locate, /geoResolveCoords/);
    assert.match(locate, /resolutionFromGeocode/);
    assert.match(read('lib/geoplace/fromGeocode.ts'), /source: 'device-geocode'/);
  });
});
