// ============================================================
// Animaldex — Localidades (Argentina)
// ============================================================
// Lista curada y ESCALABLE: se usa para el selector rápido de
// localidad en Alertas (sin mapas, sin dependencias externas).
// Se puede seguir agregando provincias/localidades más adelante
// sin tocar ningún otro archivo.
//
// El usuario también puede escribir cualquier localidad que no
// esté en esta lista ("Buscar otra localidad") — el buscador filtra
// sobre este dataset, y si no encuentra coincidencias, se acepta el
// texto tal cual lo escribió (ver lib/geo.ts → searchLocalities).

export interface LocalityEntry {
  locality: string;
  province: string;
}

export const ARGENTINA_LOCALITIES: Record<string, string[]> = {
  Salta: [
    'Salta Capital',
    'San Lorenzo',
    'Cerrillos',
    'Vaqueros',
    'Rosario de Lerma',
    'La Caldera',
    'Campo Quijano',
    'General Güemes',
    'Cafayate',
    'San Ramón de la Nueva Orán',
    'Tartagal',
    'Metán',
  ],
  'Buenos Aires': [
    'La Plata',
    'Mar del Plata',
    'Bahía Blanca',
    'San Isidro',
    'Tigre',
    'Quilmes',
    'Morón',
    'Vicente López',
    'Pilar',
    'Tandil',
  ],
  'Ciudad Autónoma de Buenos Aires': ['CABA'],
  Córdoba: ['Córdoba Capital', 'Villa Carlos Paz', 'Río Cuarto', 'Villa María', 'Alta Gracia', 'Jesús María'],
  'Santa Fe': ['Santa Fe Capital', 'Rosario', 'Rafaela', 'Venado Tuerto', 'Reconquista'],
  Mendoza: ['Mendoza Capital', 'San Rafael', 'Godoy Cruz', 'Maipú', 'Luján de Cuyo'],
  Tucumán: ['San Miguel de Tucumán', 'Yerba Buena', 'Tafí Viejo', 'Concepción'],
  'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Concepción del Uruguay'],
  Jujuy: ['San Salvador de Jujuy', 'Palpalá', 'Perico', 'Libertador General San Martín'],
  Misiones: ['Posadas', 'Oberá', 'Eldorado', 'Puerto Iguazú'],
  Chaco: ['Resistencia', 'Presidencia Roque Sáenz Peña'],
  Corrientes: ['Corrientes Capital', 'Goya', 'Mercedes'],
  'Río Negro': ['Viedma', 'San Carlos de Bariloche', 'General Roca', 'Cipolletti'],
  Neuquén: ['Neuquén Capital', 'Plottier', 'Cutral Co'],
  Chubut: ['Rawson', 'Comodoro Rivadavia', 'Trelew', 'Puerto Madryn'],
  Formosa: ['Formosa Capital', 'Clorinda'],
  'Santiago del Estero': ['Santiago del Estero Capital', 'La Banda'],
  'San Juan': ['San Juan Capital', 'Rivadavia', 'Chimbas'],
  'San Luis': ['San Luis Capital', 'Villa Mercedes'],
  Catamarca: ['San Fernando del Valle de Catamarca'],
  'La Rioja': ['La Rioja Capital'],
  'La Pampa': ['Santa Rosa', 'General Pico'],
  'Santa Cruz': ['Río Gallegos', 'Caleta Olivia'],
  'Tierra del Fuego': ['Ushuaia', 'Río Grande'],
};

// Utilidades de texto: comparar localidades sin depender de
// mayúsculas/acentos (ej. "salta capital" === "Salta Capital").
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getLocalitiesForProvince(province: string | null | undefined): string[] {
  if (!province) return [];
  const key = Object.keys(ARGENTINA_LOCALITIES).find(
    (p) => normalizeText(p) === normalizeText(province)
  );
  return key ? ARGENTINA_LOCALITIES[key] : [];
}

export function getProvinceForLocality(locality: string): string | null {
  const target = normalizeText(locality);
  for (const [province, list] of Object.entries(ARGENTINA_LOCALITIES)) {
    if (list.some((l) => normalizeText(l) === target)) return province;
  }
  return null;
}

// Búsqueda libre en todo el dataset (usada por "Buscar otra localidad").
export function searchLocalities(query: string, limit = 20): LocalityEntry[] {
  const q = normalizeText(query);
  if (!q) return [];
  const results: LocalityEntry[] = [];
  for (const [province, list] of Object.entries(ARGENTINA_LOCALITIES)) {
    for (const locality of list) {
      if (normalizeText(locality).includes(q) || normalizeText(province).includes(q)) {
        results.push({ locality, province });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}
