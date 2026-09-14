import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alertsLocalityNeedsReplace,
  parseAlertsLocalitySource,
  shouldRefreshAlertsLocalityOnEnter,
} from '../lib/geo.ts';
import { placeById, searchPlaces } from '../lib/geoplace/catalog.ts';
import { placeDisplayName } from '../lib/geoplace/format.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const SALTA = 'AR:georef:66028050';
const GUEMES = 'AR:georef:66049040';
const CARRIL = 'AR:georef:66042020';
const CERRILLOS = 'AR:georef:66035010';

const alerts = read('screens/AlertsScreen.tsx');
const picker = read('components/PlacePicker.tsx');
const geo = read('lib/geo.ts');

describe('Alertas: automática vs manual', () => {
  it('guardados sin source (p. ej. Salta Capital por GPS) se tratan como automáticos', () => {
    assert.equal(parseAlertsLocalitySource(undefined), 'auto');
    assert.equal(parseAlertsLocalitySource(null), 'auto');
    assert.equal(parseAlertsLocalitySource('auto'), 'auto');
    assert.equal(parseAlertsLocalitySource('manual'), 'manual');
    assert.equal(parseAlertsLocalitySource('gps'), 'auto');
  });

  it('ubicación automática anterior Salta Capital + detección General Güemes → reemplaza', () => {
    const salta = placeById(SALTA)!;
    const guemes = placeById(GUEMES)!;
    assert.equal(placeDisplayName(salta), 'Salta Capital');
    assert.equal(placeDisplayName(guemes), 'General Güemes');

    assert.equal(shouldRefreshAlertsLocalityOnEnter('auto'), true);
    assert.equal(
      alertsLocalityNeedsReplace(
        { placeId: salta.placeId, locality: placeDisplayName(salta), province: salta.admin1Name },
        { placeId: guemes.placeId, locality: placeDisplayName(guemes), province: guemes.admin1Name }
      ),
      true
    );
  });

  it('selección MANUAL El Carril + ubicación física Cerrillos → permanece El Carril', () => {
    const carril = placeById(CARRIL)!;
    const cerrillos = placeById(CERRILLOS)!;
    assert.equal(placeDisplayName(carril), 'El Carril');
    assert.equal(placeDisplayName(cerrillos), 'Cerrillos');

    assert.equal(shouldRefreshAlertsLocalityOnEnter('manual'), false);
    // Aunque la detección apuntaría a otro municipio, el modo manual no refresca.
    assert.equal(
      alertsLocalityNeedsReplace(
        { placeId: carril.placeId, locality: placeDisplayName(carril), province: carril.admin1Name },
        { placeId: cerrillos.placeId, locality: placeDisplayName(cerrillos), province: cerrillos.admin1Name }
      ),
      true
    );
  });

  it('si el municipio no cambió, no reemplaza', () => {
    const salta = placeById(SALTA)!;
    const identity = {
      placeId: salta.placeId,
      locality: placeDisplayName(salta),
      province: salta.admin1Name,
    };
    assert.equal(alertsLocalityNeedsReplace(identity, identity), false);
  });

  it('Alertas refresca GPS al entrar solo en modo automático', () => {
    assert.match(alerts, /parseAlertsLocalitySource\(saved\.source\)/);
    assert.match(alerts, /shouldRefreshAlertsLocalityOnEnter\(localitySourceRef\.current\)/);
    assert.match(alerts, /refreshAutoLocation/);
    assert.match(alerts, /await refreshAutoLocation\(\)/);
    assert.match(alerts, /void refreshAutoLocation\(\)/);
    assert.match(alerts, /applyLocality\(sel, 'auto'\)/);
    assert.match(alerts, /if \(source === 'manual'\) locateGenRef\.current \+= 1/);
    // Ya no sale apenas hay localidad guardada: ese early-return era el bug.
    assert.doesNotMatch(
      alerts,
      /setLocating\(false\);\s*fetchPage\(true\);\s*return;/
    );
  });

  it('"Usar mi ubicación actual" vuelve al modo automático', () => {
    assert.match(picker, /choose\(only, 'auto'\)/);
    assert.match(picker, /choose\(item\.place, 'auto'\)/);
    assert.match(alerts, /saveAlertsLocality\(\{[\s\S]*source,/);
    assert.match(alerts, /applyLocality\(placeSelection\(only\), 'auto'\)/);
  });
});

describe('PlacePicker: búsqueda, contrato y teclado', () => {
  it('sigue permitiendo búsqueda manual contra el catálogo', () => {
    const found = searchPlaces('El Carril', { limit: 5 });
    assert.ok(found.matches.some((m) => m.place.placeId === CARRIL));
    assert.match(picker, /searchPlaces\(trimmed/);
    assert.match(picker, /choose\(item\.place, 'manual'\)/);
    assert.doesNotMatch(picker, /acceptTyped/);
    assert.doesNotMatch(picker, /locality: query/);
  });

  it('no rompe el contrato GeoPlace / placeSelection', () => {
    assert.match(picker, /export function placeSelection\(place: GeoPlace\)/);
    assert.match(picker, /locality: placeDisplayName\(place\)/);
    assert.match(picker, /lat: place\.centroidLat/);
    assert.match(picker, /lon: place\.centroidLng/);
    const calls = picker.match(/onSelect\(/g) || [];
    assert.equal(calls.length, 1);
    assert.match(picker, /onSelect\(placeSelection\(place\),\s*source\)/);

    const cerrillos = placeById(CERRILLOS)!;
    assert.equal(cerrillos.placeId, CERRILLOS);
    assert.equal(placeDisplayName(cerrillos), 'Cerrillos');
    assert.equal(cerrillos.admin1Name, 'Salta');
    assert.equal(typeof cerrillos.centroidLat, 'number');
    assert.equal(typeof cerrillos.centroidLng, 'number');
  });

  it('al enfocar el buscador el panel se expande con teclado y safe area', () => {
    assert.match(picker, /KeyboardAvoidingView/);
    assert.match(picker, /useSafeAreaInsets/);
    assert.match(picker, /onFocus=\{\(\) => setSearchFocused\(true\)\}/);
    assert.match(picker, /searchFocused \? \{ paddingTop: insets\.top \+ 12 \}/);
    assert.match(picker, /sheetExpanded/);
    assert.match(picker, /paddingBottom: Math\.max\(insets\.bottom/);
    assert.doesNotMatch(picker, /Samsung|Motorola|Galaxy/i);
    assert.match(picker, /GEO_ATTRIBUTION/);
  });

  it('el source vive solo en AsyncStorage, no en D1 ni en GEO de detección', () => {
    assert.match(geo, /ALERTS_LOCALITY_KEY/);
    assert.doesNotMatch(read('lib/placeLocate.ts'), /AlertsLocalitySource/);
    assert.doesNotMatch(read('lib/geoplace/fromGeocode.ts'), /AlertsLocalitySource/);
    assert.doesNotMatch(read('worker/index.js'), /alertsLocalitySource/);
  });
});
