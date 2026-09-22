// Escritura opcional de contacto público del propietario.
// PRAGMA: si la columna no está, el UPDATE/SELECT sigue. NUNCA ALTER TABLE.

const USER_CONTACT_COLUMNS = ['contact_whatsapp', 'contact_phone', 'pet_contact_visible'];
const PROFILE_CONTACT_COLUMNS = ['pet_contact_visible'];

async function tableColumns(env, table, cacheKey) {
  if (env[cacheKey]) return env[cacheKey];
  let names = new Set();
  try {
    const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    names = new Set((res.results || []).map((r) => String(r.name)));
  } catch (_) {
    names = new Set();
  }
  env[cacheKey] = names;
  return names;
}

export async function usersHasContactColumns(env) {
  const names = await tableColumns(env, 'users', '_userContactCols');
  return USER_CONTACT_COLUMNS.every((c) => names.has(c));
}

export async function profilesHasPetContactVisible(env) {
  const names = await tableColumns(env, 'profiles', '_profileContactCols');
  return PROFILE_CONTACT_COLUMNS.every((c) => names.has(c));
}

export async function prefsHasLostBreedMatch(env) {
  const names = await tableColumns(env, 'user_notification_prefs', '_prefLostBreedCols');
  return names.has('lost_breed_match');
}

export function readUserContact(row) {
  if (!row) return { contactWhatsapp: null, contactPhone: null, petContactVisible: false };
  return {
    contactWhatsapp: row.contact_whatsapp || null,
    contactPhone: row.contact_phone || null,
    petContactVisible: Number(row.pet_contact_visible) === 1,
  };
}

export function readProfileContactVisible(row) {
  return Number(row?.pet_contact_visible) === 1;
}

export async function updateUserPetContact(env, userId, input) {
  const has = await usersHasContactColumns(env);
  if (!has) return { ok: false, skipped: 'missing_columns' };
  await env.DB.prepare(
    'UPDATE users SET contact_whatsapp = ?, contact_phone = ?, pet_contact_visible = ? WHERE id = ?'
  )
    .bind(input.whatsapp, input.phone, input.visible ? 1 : 0, userId)
    .run();
  return { ok: true };
}

export async function updateProfilePetContactVisible(env, profileId, visible) {
  const has = await profilesHasPetContactVisible(env);
  if (!has) return { ok: false, skipped: 'missing_columns' };
  await env.DB.prepare('UPDATE profiles SET pet_contact_visible = ? WHERE id = ?')
    .bind(visible ? 1 : 0, profileId)
    .run();
  return { ok: true };
}
