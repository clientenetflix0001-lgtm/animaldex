// ============================================================
// Animaldex — filtrado territorial por identidad.
// ============================================================
// Hasta Fase 4 los seis filtros territoriales comparaban texto:
//
//   WHERE LOWER(a.locality) = LOWER(?)
//
// Eso falla de tres formas distintas. Mezcla homónimos de provincias
// diferentes (hay cinco "San Lorenzo" en el país). No reconoce los nombres
// heredados, así que quien elige la localidad oficial "San José de los
// Cerrillos" no ve las filas guardadas como "Cerrillos". Y `LOWER()` de
// SQLite sólo minusculiza ASCII, así que "Oran" nunca alcanza a "Orán".
//
// Este módulo filtra por identidad y deja el texto como compatibilidad
// acotada. Tres reglas lo gobiernan:
//
//   1. NO SE CONFÍA EN EL CLIENTE. Llega un placeId (o un código admin), se
//      valida contra el catálogo y los demás códigos se derivan del servidor.
//      Una identidad que el catálogo no reconoce se rechaza, no se usa "como
//      venga".
//
//   2. EL FALLBACK LEGACY NO MEZCLA PROVINCIAS. Sólo alcanza a filas con
//      `place_id IS NULL`, y sólo acepta los textos que el resolvedor mapea de
//      forma inequívoca a ese lugar con el contexto disponible. Es la misma
//      decisión que tomó el backfill de Fase 4: si el backfill no se animó a
//      resolver un texto, el filtro tampoco lo acepta.
//
//   3. NO SE ASUME EL ESQUEMA. Las columnas se detectan con PRAGMA table_info.
//      Sin ellas el filtro degrada al texto legacy, así que el Worker corre
//      igual contra una base sin migrations/015 aplicada.
// ============================================================

import {
  admin1Name,
  admin2Name,
  placeById,
  placesInAdmin2,
} from '../lib/geoplace/catalog.ts';
import { ADMIN1_ALIASES, ALIAS_RULES } from '../lib/geoplace/aliases.ts';
import { resolvePlaceFromText } from '../lib/geoplace/resolve.ts';
import { normalizeGeoText } from '../lib/geoplace/normalize.ts';
import { geoColumns } from './geoWrite.js';

/**
 * Ámbitos de filtrado, del más preciso al más amplio.
 *
 *   locality -> place_id     identidad exacta de la localidad
 *   admin2   -> admin2_code  departamento; el ámbito seguro cuando el GPS no
 *                            puede afirmar una localidad (Fase 5, punto 4)
 *   admin1   -> admin1_code  provincia
 */
export const TERRITORY_SCOPES = ['locality', 'admin2', 'admin1'];

/** De dónde sale el texto legacy de cada tabla filtrable. */
export const TERRITORY_TABLES = {
  alerts: { locality: 'locality', province: 'province' },
  listings: { locality: 'locality', province: 'province' },
  profiles: { locality: 'locality', province: null },
};

/**
 * Techo de variantes de texto aceptadas en el fallback legacy de un ámbito
 * departamental. Un departamento argentino tiene decenas de localidades, no
 * miles; si alguna vez se pasa, se prefiere quedarse sin fallback antes que
 * armar un IN interminable.
 */
export const LEGACY_VARIANT_LIMIT = 120;

// ------------------------------------------------------------
// Comparación de texto dentro de SQLite
// ------------------------------------------------------------
//
// SQLite corta la consulta con "parser stack overflow" alrededor de las treinta
// llamadas a función anidadas, así que el plegado tiene que ser económico. Lo
// que entra en SQL es lo que depende de la fila: quitar diacríticos, bajar a
// minúsculas y recortar. Diecisiete niveles, con margen.
//
// `lower()` de SQLite minusculiza sólo ASCII, así que las vocales acentuadas se
// mapean a su letra base en ambas cajas ANTES de llamarlo. Después de eso no
// queda ningún carácter fuera de ASCII y `lower()` alcanza.
//
// La puntuación se deja como está y se cubre del lado del valor, enumerando la
// forma sin puntuación junto a la del catálogo.

/** Diacríticos a su letra base, en las dos cajas. */
const ACCENT_PAIRS = [
  ['á', 'a'], ['é', 'e'], ['í', 'i'], ['ó', 'o'], ['ú', 'u'], ['ü', 'u'], ['ñ', 'n'],
  ['Á', 'a'], ['É', 'e'], ['Í', 'i'], ['Ó', 'o'], ['Ú', 'u'], ['Ü', 'u'], ['Ñ', 'n'],
];

/** Colapso de espacios repetidos. Cada pasada cubre el doble de corrida. */
const SPACE_PASSES = 2;

function sqlLiteral(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/**
 * Expresión SQL de comparación para una columna de texto territorial.
 *
 * Se arma con nombres de columna del servidor y literales fijos; los valores a
 * comparar viajan siempre como parámetros, así que no hay superficie de
 * inyección.
 */
export function sqlFoldExpression(column) {
  let out = column;
  for (const [accented, base] of ACCENT_PAIRS) {
    out = `replace(${out}, ${sqlLiteral(accented)}, ${sqlLiteral(base)})`;
  }
  out = `lower(${out})`;
  for (let i = 0; i < SPACE_PASSES; i += 1) out = `replace(${out}, '  ', ' ')`;
  return `trim(${out})`;
}

/** Profundidad de anidamiento de la expresión. Los tests la vigilan. */
export const SQL_FOLD_DEPTH = ACCENT_PAIRS.length + SPACE_PASSES + 2;

/** El mismo plegado que hace la expresión SQL, replicado en JS. */
export function foldLikeSql(text) {
  let out = String(text ?? '');
  for (const [accented, base] of ACCENT_PAIRS) out = out.split(accented).join(base);
  for (let i = 0; i < SPACE_PASSES; i += 1) out = out.split('  ').join(' ');
  return out.toLowerCase().trim();
}

/**
 * Formas en que un texto del catálogo puede haber quedado guardado, ya
 * plegadas: la del catálogo y la misma sin puntuación.
 */
export function comparableVariants(text) {
  return [...new Set([foldLikeSql(text), normalizeGeoText(text)])].filter(Boolean);
}

function expandVariants(texts) {
  const out = new Set();
  for (const text of texts) for (const variant of comparableVariants(text)) out.add(variant);
  return [...out];
}

// ------------------------------------------------------------
// Identidad territorial que llega del cliente
// ------------------------------------------------------------

function str(value) {
  return value == null ? '' : String(value).slice(0, 80).trim();
}

/**
 * Código de nivel 1 al que pertenece un departamento, leído del catálogo.
 *
 * No se deriva del código admin2 aunque en Argentina lo contenga: eso es una
 * convención del INDEC y el modelo no depende de ningún país.
 */
function admin1CodeOfAdmin2(admin2Code) {
  const places = placesInAdmin2(admin2Code);
  return places.length ? places[0].admin1Code : null;
}

/**
 * Traduce la identidad territorial del cuerpo del request.
 *
 * @returns {{scope:string, place:object|null, admin1Code:string|null,
 *            admin2Code:string|null}|null} null cuando el cliente no mandó
 *          ninguna identidad (cliente viejo, o consulta sin filtro).
 */
export function normalizeTerritory(body) {
  const placeId = str(body && body.placeId);
  const admin2Code = str(body && body.admin2Code);
  const admin1Code = str(body && body.admin1Code);
  const asked = str(body && body.territoryScope);
  const scope = TERRITORY_SCOPES.includes(asked) ? asked : null;

  // Localidad: el placeId manda y los códigos se derivan de él.
  if (placeId && (!scope || scope === 'locality')) {
    const place = placeById(placeId);
    if (!place) return null;
    return {
      scope: 'locality',
      place,
      admin1Code: place.admin1Code,
      admin2Code: place.admin2Code,
    };
  }

  // Departamento: el ámbito al que degrada Home cuando el GPS no puede
  // afirmar una localidad. El código se valida contra el catálogo.
  if (admin2Code && (!scope || scope === 'admin2') && admin2Name(admin2Code)) {
    return {
      scope: 'admin2',
      place: null,
      admin1Code: admin1CodeOfAdmin2(admin2Code),
      admin2Code,
    };
  }

  if (admin1Code && (!scope || scope === 'admin1') && admin1Name(admin1Code)) {
    return { scope: 'admin1', place: null, admin1Code, admin2Code: null };
  }

  return null;
}

/**
 * Identidad derivada del texto que la app viene guardando, para visitantes que
 * todavía no mandan un placeId.
 *
 * Devuelve null salvo que el resolvedor deje un único lugar: nunca se adivina.
 * "San Lorenzo" sigue sin identidad incluso con la provincia puesta.
 */
export function territoryFromText(locality, province) {
  const resolution = resolvePlaceFromText(locality, province ? { admin1Name: province } : null);
  const place = resolution.place;
  if (!place) return null;
  return {
    scope: 'locality',
    place,
    admin1Code: place.admin1Code,
    admin2Code: place.admin2Code,
  };
}

/**
 * true si el cliente afirmó una identidad territorial que el catálogo no
 * reconoce. Se responde 400 en vez de filtrar por un código inventado, que
 * devolvería una lista vacía indistinguible de "no hay nada por acá".
 */
export function territoryRejected(body) {
  if (!body) return false;
  const placeId = str(body.placeId);
  if (placeId) return !placeById(placeId);
  const admin2Code = str(body.admin2Code);
  if (admin2Code) return !admin2Name(admin2Code);
  const admin1Code = str(body.admin1Code);
  if (admin1Code) return !admin1Name(admin1Code);
  return false;
}

// ------------------------------------------------------------
// Textos legacy que pueden referirse a un lugar
// ------------------------------------------------------------

/**
 * Formas en que la app pudo haber escrito este lugar antes del catálogo: el
 * nombre oficial, los aliases que apuntan acá y el patrón "<jurisdicción>
 * Capital" cuando la localidad se llama igual que su provincia.
 */
export function legacyTextVariants(place) {
  const texts = new Set([place.localityName]);

  for (const rule of ALIAS_RULES) {
    if (rule.target && rule.target === place.providerPlaceId) texts.add(rule.match);
  }

  const provinceName = admin1Name(place.admin1Code);
  if (provinceName && normalizeGeoText(provinceName) === normalizeGeoText(place.localityName)) {
    texts.add(`${provinceName} Capital`);
    for (const [alias, code] of Object.entries(ADMIN1_ALIASES)) {
      if (code === place.admin1Code) texts.add(`${alias} capital`);
    }
  }

  return [...texts];
}

/** Nombres con los que la columna `province` pudo haber guardado un nivel 1. */
export function legacyProvinceVariants(admin1Code) {
  const texts = new Set();
  const official = admin1Name(admin1Code);
  if (official) texts.add(official);
  for (const [alias, code] of Object.entries(ADMIN1_ALIASES)) {
    if (code === admin1Code) texts.add(alias);
  }
  return expandVariants(texts);
}

/**
 * Qué textos legacy puede aceptar el filtro para este lugar, y con qué
 * exigencia de provincia.
 *
 * Cada variante se somete al resolvedor: se acepta sólo si éste devuelve
 * exactamente este lugar. Así el filtro y el backfill de Fase 4 comparten
 * criterio por construcción — "Cerrillos" con provincia Salta entra, y
 * "San Lorenzo" no entra nunca porque sigue ambiguo incluso dentro de Salta.
 */
export function legacyLocalityPlan(place) {
  const anywhere = new Set();
  const withProvince = new Set();

  for (const text of legacyTextVariants(place)) {
    if (!normalizeGeoText(text)) continue;
    if (resolvePlaceFromText(text).place?.placeId === place.placeId) {
      anywhere.add(text);
    } else if (resolvePlaceFromText(text, { admin1Code: place.admin1Code }).place?.placeId === place.placeId) {
      withProvince.add(text);
    }
  }

  return {
    anywhere: expandVariants(anywhere),
    withProvince: expandVariants(withProvince),
    provinces: legacyProvinceVariants(place.admin1Code),
  };
}

/** Plan combinado de todas las localidades de un departamento. */
function legacyAdmin2Plan(admin2Code) {
  const anywhere = new Set();
  const withProvince = new Set();
  let provinces = [];
  for (const place of placesInAdmin2(admin2Code)) {
    const plan = legacyLocalityPlan(place);
    plan.anywhere.forEach((t) => anywhere.add(t));
    plan.withProvince.forEach((t) => withProvince.add(t));
    if (!provinces.length) provinces = plan.provinces;
  }
  if (anywhere.size + withProvince.size > LEGACY_VARIANT_LIMIT) return null;
  return { anywhere: [...anywhere], withProvince: [...withProvince], provinces };
}

// ------------------------------------------------------------
// Condiciones SQL
// ------------------------------------------------------------

function inClause(expression, values) {
  return `${expression} IN (${values.map(() => '?').join(', ')})`;
}

/**
 * Rama de texto legacy para un plan de localidad. Devuelve null cuando no hay
 * ninguna variante segura: entonces el filtro se queda sólo con la identidad,
 * que es lo correcto — preferimos no mostrar una fila antes que mostrar la de
 * otra provincia.
 */
function legacyLocalityBranch(alias, spec, plan) {
  const localityExpr = sqlFoldExpression(`${alias}.${spec.locality}`);
  const provinceExpr = spec.province ? sqlFoldExpression(`${alias}.${spec.province}`) : null;
  const usableProvince = provinceExpr && plan.provinces.length;
  const parts = [];
  const values = [];

  // Nombres inequívocos en todo el país. Aun así, si la fila declara una
  // provincia, tiene que ser la correcta: el fallback nunca puede reclamar una
  // fila que dice pertenecer a otro lado.
  if (plan.anywhere.length) {
    const name = inClause(localityExpr, plan.anywhere);
    values.push(...plan.anywhere);
    if (usableProvince) {
      parts.push(`(${name} AND (${alias}.${spec.province} IS NULL OR ${alias}.${spec.province} = '' OR ${inClause(provinceExpr, plan.provinces)}))`);
      values.push(...plan.provinces);
    } else {
      parts.push(name);
    }
  }

  // Nombres que sólo son inequívocos dentro de una provincia: la fila la tiene
  // que declarar. Sin columna `province` no hay forma de acotarlos y no entran.
  if (plan.withProvince.length && usableProvince) {
    parts.push(`(${inClause(localityExpr, plan.withProvince)} AND ${inClause(provinceExpr, plan.provinces)})`);
    values.push(...plan.withProvince, ...plan.provinces);
  }

  if (!parts.length) return null;
  return { sql: parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`, values };
}

function legacyBranch(alias, spec, territory) {
  if (territory.scope === 'locality' && territory.place) {
    return legacyLocalityBranch(alias, spec, legacyLocalityPlan(territory.place));
  }

  if (territory.scope === 'admin2' && territory.admin2Code) {
    const plan = legacyAdmin2Plan(territory.admin2Code);
    return plan ? legacyLocalityBranch(alias, spec, plan) : null;
  }

  // Provincia: la columna `province` es exactamente el nivel 1, así que se
  // compara con ella y no hace falta enumerar localidades.
  if (territory.scope === 'admin1' && spec.province && territory.admin1Code) {
    const provinces = legacyProvinceVariants(territory.admin1Code);
    if (!provinces.length) return null;
    const expr = sqlFoldExpression(`${alias}.${spec.province}`);
    return { sql: inClause(expr, provinces), values: provinces };
  }

  return null;
}

function identityBranch(alias, columns, territory) {
  if (territory.scope === 'locality' && territory.place && columns.includes('place_id')) {
    return { sql: `${alias}.place_id = ?`, values: [territory.place.placeId] };
  }
  if (territory.scope === 'admin2' && territory.admin2Code && columns.includes('admin2_code')) {
    return { sql: `${alias}.admin2_code = ?`, values: [territory.admin2Code] };
  }
  if (territory.scope === 'admin1' && territory.admin1Code && columns.includes('admin1_code')) {
    return { sql: `${alias}.admin1_code = ?`, values: [territory.admin1Code] };
  }
  return null;
}

/**
 * Condición territorial para una tabla.
 *
 *   identidad por código
 *   OR (place_id IS NULL AND texto legacy seguro)
 *
 * La segunda rama existe sólo por las filas anteriores al backfill y se apaga
 * sola a medida que se resuelven. Las dos filas que Fase 4 dejó en conflicto
 * (el "San Lorenzo" ambiguo y el texto con pinta de dirección) no entran por
 * ninguna de las dos ramas, que es justamente lo que se decidió.
 *
 * @returns {Promise<{sql:string, values:unknown[]}|null>}
 */
export async function territoryCondition(env, table, alias, territory) {
  const spec = TERRITORY_TABLES[table];
  if (!spec || !territory) return null;

  const columns = await geoColumns(env, table);
  const identity = identityBranch(alias, columns, territory);
  const legacy = legacyBranch(alias, spec, territory);

  // Sin las columnas nuevas, el texto legacy es lo único que hay.
  if (!identity) return legacy;
  if (!legacy) return identity;

  const guarded = `(${alias}.place_id IS NULL AND ${legacy.sql})`;
  return {
    sql: `(${identity.sql} OR ${guarded})`,
    values: [...identity.values, ...legacy.values],
  };
}

/**
 * La misma decisión que `territoryCondition`, evaluada en JS sobre una fila ya
 * traída. Hace falta donde el SQL filtra a grandes rasgos y después se refina
 * en memoria (Home mezcla el radio métrico con la pertenencia territorial): sin
 * esto, una fila admitida por identidad se descartaría por no coincidir el
 * texto, que es exactamente el problema que vino a resolver esta fase.
 */
export function rowMatchesTerritory(row, table, territory) {
  const spec = TERRITORY_TABLES[table];
  if (!spec || !territory || !row) return false;

  const placeId = row.place_id || null;
  if (placeId) {
    if (territory.scope === 'locality') return placeId === territory.place?.placeId;
    const place = placeById(placeId);
    if (!place) return false;
    if (territory.scope === 'admin2') return place.admin2Code === territory.admin2Code;
    return place.admin1Code === territory.admin1Code;
  }

  // Fila legacy: mismo criterio de texto que la rama SQL.
  const plan = territory.scope === 'locality' && territory.place
    ? legacyLocalityPlan(territory.place)
    : territory.scope === 'admin2' && territory.admin2Code
      ? legacyAdmin2Plan(territory.admin2Code)
      : null;

  if (territory.scope === 'admin1') {
    if (!spec.province) return false;
    return legacyProvinceVariants(territory.admin1Code).includes(foldLikeSql(row[spec.province]));
  }
  if (!plan) return false;

  const locality = foldLikeSql(row[spec.locality]);
  const province = spec.province ? foldLikeSql(row[spec.province]) : '';
  const usableProvince = !!spec.province && plan.provinces.length > 0;
  const provinceOk = plan.provinces.includes(province);

  if (plan.anywhere.includes(locality)) {
    return !usableProvince || !province || provinceOk;
  }
  if (!plan.withProvince.includes(locality) || !usableProvince) return false;
  return provinceOk;
}

/**
 * Filtro por texto para un visitante cuya ubicación guardada no resuelve a
 * ningún lugar del catálogo (texto libre viejo, o una localidad que Georef no
 * tiene). Conserva la semántica anterior — igualdad de nombre — pero plegando
 * acentos y mayúsculas, y pinchando la provincia cuando la fila la tiene.
 */
export function legacyTextCondition(alias, table, locality, province) {
  const spec = TERRITORY_TABLES[table];
  if (!spec || !normalizeGeoText(locality)) return null;

  const localityVariants = comparableVariants(locality);
  const parts = [inClause(sqlFoldExpression(`${alias}.${spec.locality}`), localityVariants)];
  const values = [...localityVariants];

  const provinceVariants = normalizeGeoText(province) ? comparableVariants(province) : [];
  if (provinceVariants.length && spec.province) {
    const expr = sqlFoldExpression(`${alias}.${spec.province}`);
    parts.push(`(${inClause(expr, provinceVariants)} OR ${alias}.${spec.province} IS NULL)`);
    values.push(...provinceVariants);
  }

  return { sql: parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`, values };
}
