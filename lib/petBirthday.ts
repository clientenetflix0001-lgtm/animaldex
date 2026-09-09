/**
 * Cumpleaños anuales de mascotas personales — notificaciones internas de Actividad.
 *
 * Fuente de verdad: pets.birth_date (YYYY-MM-DD). La edad se calcula por calendario;
 * no se persiste una edad nueva.
 *
 * Zona horaria de "hoy": America/Argentina/Salta (UTC−3, sin DST).
 * El Cron de Cloudflare corre en UTC; siempre convertir antes de comparar.
 *
 * 29 de febrero:
 *   - En año bisiesto se notifica el 29/02.
 *   - En año no bisiesto se notifica el 28/02 (regla explícita de Animaldex).
 *
 * Solo mascotas de usuario común: profile_id IS NULL (o perfil type = personal).
 * Las mascotas con profile_id de protector/business quedan fuera de esta etapa.
 */

import { daysInMonth, isLeapYear, parseBirthDate } from './birthDate.ts';

export const ARGENTINA_TIME_ZONE = 'America/Argentina/Salta';
export const BIRTHDAY_ACTIVITY_TYPE = 'birthday';
export const BIRTHDAY_BODY = 'Celebrá su día con una publicación especial.';

export type CalendarYmd = { year: number; month: number; day: number };

export type BirthdaySkipReason =
  | 'missing'
  | 'invalid'
  | 'archived'
  | 'not_common_user'
  | 'not_today'
  | 'under_one_year'
  | 'future';

export type BirthdayDecision =
  | { notify: false; reason: BirthdaySkipReason }
  | { notify: true; years: number; observedMonth: number; observedDay: number };

export function argentinaDateParts(nowMs: number = Date.now()): CalendarYmd {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(nowMs));
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: num('year'), month: num('month'), day: num('day') };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(parts: CalendarYmd): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Aniversario observado en `year`: 29/02 → 28/02 si ese año no es bisiesto. */
export function observedAnniversary(birth: { month: number; day: number }, year: number): { month: number; day: number } {
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return { month: 2, day: 28 };
  }
  return { month: birth.month, day: birth.day };
}

export function isAnnualBirthdayToday(birth: CalendarYmd, today: CalendarYmd): boolean {
  const observed = observedAnniversary(birth, today.year);
  return today.month === observed.month && today.day === observed.day;
}

/** Años cumplidos por calendario, usando la regla 29/02 → 28/02 en no bisiestos. */
export function completedCalendarYears(birth: CalendarYmd, today: CalendarYmd): number {
  const observed = observedAnniversary(birth, today.year);
  let years = today.year - birth.year;
  if (today.month < observed.month || (today.month === observed.month && today.day < observed.day)) {
    years -= 1;
  }
  return years;
}

export function isCommonUserPet(input: { profileId?: string | null; profileType?: string | null }): boolean {
  const profileId = input.profileId == null || String(input.profileId).trim() === '' ? null : String(input.profileId);
  if (!profileId) return true;
  return input.profileType === 'personal';
}

export function birthdayIdempotencyKey(petId: string, year: number): string {
  return `${BIRTHDAY_ACTIVITY_TYPE}:${petId}:${year}`;
}

export function birthdayNotificationCopy(petName: string, years: number): { title: string; body: string } {
  const name = String(petName || '').trim() || 'tu mascota';
  const ageText = years === 1 ? '1 año' : `${years} años`;
  return {
    title: `🎂 ¡Hoy ${name} cumple ${ageText}!`,
    body: BIRTHDAY_BODY,
  };
}

/** Handle público si existe; si no, id interno. PetProfile acepta ambos. */
export function petProfileNavParam(pet: { id: string; username?: string | null }): string {
  const handle = String(pet.username || '').trim();
  return handle || pet.id;
}

export function birthdayMatchParams(today: CalendarYmd): { monthDay: string; includeFeb29OnFeb28: boolean } {
  return {
    monthDay: `${pad2(today.month)}-${pad2(today.day)}`,
    includeFeb29OnFeb28: today.month === 2 && today.day === 28 && !isLeapYear(today.year),
  };
}

/** Equivale al filtro SQL de candidatas del día (mes-día + 29/02 → 28/02). */
export function matchesBirthdayMonthDay(birthDate: string | null | undefined, today: CalendarYmd): boolean {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return false;
  const md = `${pad2(parsed.month)}-${pad2(parsed.day)}`;
  const { monthDay, includeFeb29OnFeb28 } = birthdayMatchParams(today);
  return md === monthDay || (includeFeb29OnFeb28 && md === '02-29');
}

export function evaluatePersonalPetBirthday(
  pet: {
    birthDate?: string | null;
    archivedAt?: number | null;
    profileId?: string | null;
    profileType?: string | null;
  },
  nowMs: number
): BirthdayDecision {
  if (pet.archivedAt != null && Number(pet.archivedAt) > 0) {
    return { notify: false, reason: 'archived' };
  }
  if (!isCommonUserPet(pet)) return { notify: false, reason: 'not_common_user' };
  if (pet.birthDate == null || String(pet.birthDate).trim() === '') {
    return { notify: false, reason: 'missing' };
  }

  const parsed = parseBirthDate(pet.birthDate);
  if (!parsed || parsed.year < 1 || parsed.day < 1 || parsed.day > daysInMonth(parsed.year, parsed.month)) {
    return { notify: false, reason: 'invalid' };
  }

  const today = argentinaDateParts(nowMs);
  const birthIsAfterToday =
    parsed.year > today.year ||
    (parsed.year === today.year &&
      (parsed.month > today.month || (parsed.month === today.month && parsed.day > today.day)));
  if (birthIsAfterToday) return { notify: false, reason: 'future' };

  if (!isAnnualBirthdayToday(parsed, today)) return { notify: false, reason: 'not_today' };

  const years = completedCalendarYears(parsed, today);
  if (years < 1) return { notify: false, reason: 'under_one_year' };

  const observed = observedAnniversary(parsed, today.year);
  return { notify: true, years, observedMonth: observed.month, observedDay: observed.day };
}

export type BirthdayCandidate = {
  id: string;
  name: string;
  username?: string | null;
  userId: string;
  birthDate?: string | null;
  archivedAt?: number | null;
  profileId?: string | null;
  profileType?: string | null;
  emoji?: string | null;
  avatarUrl?: string | null;
};

export type BirthdayInsert = {
  id: string;
  type: typeof BIRTHDAY_ACTIVITY_TYPE;
  userId: string;
  petId: string;
  petUsername: string | null;
  idempotencyKey: string;
  title: string;
  body: string;
  years: number;
  createdAt: number;
  metadata: {
    ownerUserId: string;
    petId: string;
    petUsername: string | null;
    petName: string;
    petEmoji: string | null;
    years: number;
  };
};

export type BirthdayCronAction =
  | { petId: string; action: 'skip'; reason: BirthdaySkipReason }
  | { petId: string; action: 'ignore'; key: string }
  | { petId: string; action: 'insert'; row: BirthdayInsert };

/**
 * Un pase del Cron contra candidatas ya filtradas (o un set de prueba).
 * La idempotencia es INSERT-or-ignore por clave birthday:<petId>:<year>.
 */
export function planBirthdayNotifications(
  pets: BirthdayCandidate[],
  nowMs: number,
  existingKeys: Set<string>
): BirthdayCronAction[] {
  const today = argentinaDateParts(nowMs);
  const out: BirthdayCronAction[] = [];

  for (const pet of pets) {
    const decision = evaluatePersonalPetBirthday(pet, nowMs);
    if (!decision.notify) {
      out.push({ petId: pet.id, action: 'skip', reason: decision.reason });
      continue;
    }

    const key = birthdayIdempotencyKey(pet.id, today.year);
    if (existingKeys.has(key)) {
      out.push({ petId: pet.id, action: 'ignore', key });
      continue;
    }

    const copy = birthdayNotificationCopy(pet.name, decision.years);
    const petUsername = pet.username ? String(pet.username).trim() || null : null;
    existingKeys.add(key);
    out.push({
      petId: pet.id,
      action: 'insert',
      row: {
        id: key,
        type: BIRTHDAY_ACTIVITY_TYPE,
        userId: pet.userId,
        petId: pet.id,
        petUsername,
        idempotencyKey: key,
        title: copy.title,
        body: copy.body,
        years: decision.years,
        createdAt: nowMs,
        metadata: {
          ownerUserId: pet.userId,
          petId: pet.id,
          petUsername,
          petName: pet.name,
          petEmoji: pet.emoji || null,
          years: decision.years,
        },
      },
    });
  }

  return out;
}
