import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  argentinaDateParts,
  birthdayIdempotencyKey,
  birthdayNotificationCopy,
  completedCalendarYears,
  evaluatePersonalPetBirthday,
  formatYmd,
  isCommonUserPet,
  matchesBirthdayMonthDay,
  observedAnniversary,
  petProfileNavParam,
  planBirthdayNotifications,
  type BirthdayCandidate,
} from '../lib/petBirthday.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 11:00 UTC = 08:00 en Salta. */
function saltaMorning(isoDate: string): number {
  return Date.parse(`${isoDate}T11:00:00.000Z`);
}

function candidate(partial: Partial<BirthdayCandidate> & Pick<BirthdayCandidate, 'id' | 'birthDate'>): BirthdayCandidate {
  return {
    name: 'Luna',
    username: 'lunaqr13',
    userId: 'u-owner',
    archivedAt: null,
    profileId: null,
    profileType: null,
    emoji: '🐶',
    ...partial,
  };
}

describe('A–B annual birthdays', () => {
  it('A. birth_date hoy hace exactamente 1 año → cumple 1 año', () => {
    const now = saltaMorning('2026-08-24');
    const decision = evaluatePersonalPetBirthday(candidate({ id: 'pet-1', birthDate: '2025-08-24' }), now);
    assert.equal(decision.notify, true);
    if (decision.notify) assert.equal(decision.years, 1);
    assert.equal(birthdayNotificationCopy('Luna', 1).title, '🎂 ¡Hoy Luna cumple 1 año!');
  });

  it('B. hace exactamente 2 años → 2 años', () => {
    const now = saltaMorning('2026-08-24');
    const decision = evaluatePersonalPetBirthday(candidate({ id: 'pet-2', birthDate: '2024-08-24' }), now);
    assert.equal(decision.notify, true);
    if (decision.notify) assert.equal(decision.years, 2);
    assert.equal(birthdayNotificationCopy('Luna', 2).title, '🎂 ¡Hoy Luna cumple 2 años!');
  });
});

describe('C–E skip cases', () => {
  it('C. mascota menor de 1 año → no notifica', () => {
    const now = saltaMorning('2026-08-24');
    const decision = evaluatePersonalPetBirthday(candidate({ id: 'pet-3', birthDate: '2025-12-01' }), now);
    assert.deepEqual(decision, { notify: false, reason: 'not_today' });
    const bornThisYear = evaluatePersonalPetBirthday(candidate({ id: 'pet-3b', birthDate: '2026-08-24' }), now);
    assert.deepEqual(bornThisYear, { notify: false, reason: 'under_one_year' });
    const sixMonths = evaluatePersonalPetBirthday(candidate({ id: 'pet-3c', birthDate: '2026-02-24' }), now);
    assert.deepEqual(sixMonths, { notify: false, reason: 'not_today' });
  });

  it('D. día y mes no coinciden → no notifica', () => {
    const now = saltaMorning('2026-08-24');
    const decision = evaluatePersonalPetBirthday(candidate({ id: 'pet-4', birthDate: '2023-09-10' }), now);
    assert.deepEqual(decision, { notify: false, reason: 'not_today' });
    assert.equal(matchesBirthdayMonthDay('2023-09-10', argentinaDateParts(now)), false);
  });

  it('E. birth_date NULL o inválida → no notifica', () => {
    const now = saltaMorning('2026-08-24');
    assert.deepEqual(
      evaluatePersonalPetBirthday(candidate({ id: 'pet-5', birthDate: null }), now),
      { notify: false, reason: 'missing' }
    );
    assert.deepEqual(
      evaluatePersonalPetBirthday(candidate({ id: 'pet-5b', birthDate: 'no-fecha' }), now),
      { notify: false, reason: 'invalid' }
    );
    assert.deepEqual(
      evaluatePersonalPetBirthday(candidate({ id: 'pet-5c', birthDate: '2024-13-40' }), now),
      { notify: false, reason: 'invalid' }
    );
  });
});

describe('F–G archived and shelter', () => {
  it('F. mascota archivada → no notifica', () => {
    const now = saltaMorning('2026-08-24');
    const decision = evaluatePersonalPetBirthday(
      candidate({ id: 'pet-6', birthDate: '2024-08-24', archivedAt: 1_700_000_000_000 }),
      now
    );
    assert.deepEqual(decision, { notify: false, reason: 'archived' });
  });

  it('G. mascota de protector/refugio o empresa → NO notifica', () => {
    const now = saltaMorning('2026-08-24');
    assert.equal(isCommonUserPet({ profileId: null }), true);
    assert.equal(isCommonUserPet({ profileId: 'pr-personal', profileType: 'personal' }), true);
    assert.equal(isCommonUserPet({ profileId: 'pr-refugio', profileType: 'protector' }), false);
    assert.equal(isCommonUserPet({ profileId: 'pr-tienda', profileType: 'business' }), false);

    const shelter = evaluatePersonalPetBirthday(
      candidate({
        id: 'pet-7',
        birthDate: '2024-08-24',
        profileId: 'pr-refugio',
        profileType: 'protector',
      }),
      now
    );
    assert.deepEqual(shelter, { notify: false, reason: 'not_common_user' });

    const business = evaluatePersonalPetBirthday(
      candidate({
        id: 'pet-7b',
        birthDate: '2024-08-24',
        profileId: 'pr-tienda',
        profileType: 'business',
      }),
      now
    );
    assert.deepEqual(business, { notify: false, reason: 'not_common_user' });
  });
});

describe('H idempotency', () => {
  it('H. Cron ejecutado dos veces el mismo año → una sola notificación', () => {
    const now = saltaMorning('2026-08-24');
    const pets = [candidate({ id: 'pet-123', birthDate: '2023-08-24', name: 'Luna' })];
    const keys = new Set<string>();
    const first = planBirthdayNotifications(pets, now, keys);
    const second = planBirthdayNotifications(pets, now, keys);
    assert.equal(first.length, 1);
    assert.equal(first[0].action, 'insert');
    if (first[0].action === 'insert') {
      assert.equal(first[0].row.idempotencyKey, 'birthday:pet-123:2026');
      assert.equal(first[0].row.years, 3);
    }
    assert.equal(second[0].action, 'ignore');
    if (second[0].action === 'ignore') assert.equal(second[0].key, 'birthday:pet-123:2026');
    assert.equal(keys.size, 1);
    assert.equal(birthdayIdempotencyKey('pet-123', 2026), 'birthday:pet-123:2026');
  });
});

describe('I 29 February rule', () => {
  it('I. 29/02 en año no bisiesto → notifica el 28/02', () => {
    assert.deepEqual(observedAnniversary({ month: 2, day: 29 }, 2027), { month: 2, day: 28 });
    assert.deepEqual(observedAnniversary({ month: 2, day: 29 }, 2028), { month: 2, day: 29 });

    const nonLeap = saltaMorning('2027-02-28');
    const onObserved = evaluatePersonalPetBirthday(candidate({ id: 'pet-feb', birthDate: '2024-02-29' }), nonLeap);
    assert.equal(onObserved.notify, true);
    if (onObserved.notify) {
      assert.equal(onObserved.years, 3);
      assert.equal(onObserved.observedDay, 28);
    }

    const dayBefore = evaluatePersonalPetBirthday(
      candidate({ id: 'pet-feb', birthDate: '2024-02-29' }),
      saltaMorning('2027-02-27')
    );
    assert.deepEqual(dayBefore, { notify: false, reason: 'not_today' });

    const leapEve = evaluatePersonalPetBirthday(
      candidate({ id: 'pet-feb', birthDate: '2024-02-29' }),
      saltaMorning('2028-02-28')
    );
    assert.deepEqual(leapEve, { notify: false, reason: 'not_today' });

    const leapDay = evaluatePersonalPetBirthday(
      candidate({ id: 'pet-feb', birthDate: '2024-02-29' }),
      saltaMorning('2028-02-29')
    );
    assert.equal(leapDay.notify, true);
    if (leapDay.notify) assert.equal(leapDay.years, 4);
  });
});

describe('J Activity → PetProfile metadata', () => {
  it('J. el payload permite abrir PetProfile por handle o id', () => {
    const now = saltaMorning('2026-08-24');
    const planned = planBirthdayNotifications(
      [candidate({ id: 'pet-1787367172507-0yeh4c', username: 'lunaqr13', birthDate: '2023-08-24' })],
      now,
      new Set()
    );
    assert.equal(planned[0].action, 'insert');
    if (planned[0].action !== 'insert') throw new Error('expected insert');
    const row = planned[0].row;
    assert.equal(row.type, 'birthday');
    assert.equal(row.userId, 'u-owner');
    assert.equal(row.metadata.ownerUserId, 'u-owner');
    assert.equal(row.metadata.petId, 'pet-1787367172507-0yeh4c');
    assert.equal(row.metadata.petUsername, 'lunaqr13');
    assert.equal(petProfileNavParam({ id: row.petId, username: row.petUsername }), 'lunaqr13');
    assert.equal(petProfileNavParam({ id: 'pet-only', username: null }), 'pet-only');
    assert.equal(row.title, '🎂 ¡Hoy Luna cumple 3 años!');
    assert.equal(row.body, 'Celebrá su día con una publicación especial.');
  });
});

describe('timezone and calendar', () => {
  it('usa fecha de Salta, no UTC, alrededor de medianoche', () => {
    // 02:30 UTC del 25/08 = 23:30 del 24/08 en Salta.
    const lateSalta = Date.parse('2026-08-25T02:30:00.000Z');
    assert.equal(formatYmd(argentinaDateParts(lateSalta)), '2026-08-24');
    const stillToday = evaluatePersonalPetBirthday(candidate({ id: 'pet-tz', birthDate: '2024-08-24' }), lateSalta);
    assert.equal(stillToday.notify, true);

    // 02:30 UTC del 24/08 = 23:30 del 23/08 en Salta.
    const prevSalta = Date.parse('2026-08-24T02:30:00.000Z');
    assert.equal(formatYmd(argentinaDateParts(prevSalta)), '2026-08-23');
    const tooEarly = evaluatePersonalPetBirthday(candidate({ id: 'pet-tz', birthDate: '2024-08-24' }), prevSalta);
    assert.deepEqual(tooEarly, { notify: false, reason: 'not_today' });
  });

  it('edad por calendario, no days/365 (2025-09-10 el 2026-08-23 es 0 años)', () => {
    const today = { year: 2026, month: 8, day: 23 };
    const birth = { year: 2025, month: 9, day: 10 };
    assert.equal(completedCalendarYears(birth, today), 0);
    const onDay = evaluatePersonalPetBirthday(
      candidate({ id: 'pet-cal', birthDate: '2025-09-10' }),
      saltaMorning('2026-09-10')
    );
    assert.equal(onDay.notify, true);
    if (onDay.notify) assert.equal(onDay.years, 1);
  });
});

describe('wiring stays on the current Activity system', () => {
  it('Worker reuses notifications action + activity_events unique key + cron 11:00 UTC', () => {
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
    const activity = readFileSync(join(root, 'screens/ActivityScreen.tsx'), 'utf8');
    assert.match(worker, /INSERT OR IGNORE INTO activity_events/);
    assert.match(worker, /idempotency_key TEXT NOT NULL UNIQUE/);
    assert.match(worker, /type IN \('birthday', 'pet_transfer_requested', 'pet_transfer_accepted', 'pet_transfer_rejected'\)/);
    assert.match(worker, /async scheduled\(/);
    assert.match(worker, /runPersonalPetBirthdays/);
    assert.match(worker, /America\/Argentina\/Salta|argentinaDateParts/);
    assert.match(wrangler, /0 11 \* \* \*/);
    assert.match(activity, /n\.type === 'birthday'/);
    assert.match(activity, /navigate\('PetProfile'/);
    assert.doesNotMatch(worker, /DROP TABLE/);
  });
});
