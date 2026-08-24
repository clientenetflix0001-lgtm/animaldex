import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  adoptionStatusOverlay,
  calendarDiff,
  compactAgeLabel,
  compactWaitFromStartedAt,
  formatCompactSpan,
} from '../lib/compactTime.ts';

function at(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

function day(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

describe('formatCompactSpan D/S/M/AÑO', () => {
  it('días, semanas, meses y años', () => {
    assert.equal(formatCompactSpan(0, 0, 0), '0D');
    assert.equal(formatCompactSpan(0, 0, 6), '6D');
    assert.equal(formatCompactSpan(0, 0, 7), '1S');
    assert.equal(formatCompactSpan(0, 0, 14), '2S');
    assert.equal(formatCompactSpan(0, 1, 0), '1M');
    assert.equal(formatCompactSpan(1, 0, 0), '1 AÑO');
    assert.equal(formatCompactSpan(2, 0, 0), '2 AÑOS');
  });
});

describe('espera: solo adoption_started_at', () => {
  it('6D, 1S, 2S, 1M, 1 AÑO, 2 AÑOS', () => {
    const now = at(2026, 8, 23);
    assert.equal(compactWaitFromStartedAt(at(2026, 8, 17), now), '6D');
    assert.equal(compactWaitFromStartedAt(at(2026, 8, 16), now), '1S');
    assert.equal(compactWaitFromStartedAt(at(2026, 8, 9), now), '2S');
    assert.equal(compactWaitFromStartedAt(at(2026, 7, 23), now), '1M');
    assert.equal(compactWaitFromStartedAt(at(2025, 8, 23), now), '1 AÑO');
    assert.equal(compactWaitFromStartedAt(at(2024, 8, 23), now), '2 AÑOS');
  });

  it('sin startedAt o futuro no inventa espera', () => {
    const now = at(2026, 8, 23);
    assert.equal(compactWaitFromStartedAt(null, now), '');
    assert.equal(compactWaitFromStartedAt(at(2026, 8, 24), now), '');
    assert.equal(adoptionStatusOverlay('en_adopcion', null, now), 'En adopción');
    assert.equal(adoptionStatusOverlay('en_adopcion', at(2026, 8, 17), now), 'En adopción · Esperando 6D');
    assert.equal(adoptionStatusOverlay('en_recuperacion', at(2026, 1, 1), now), 'En recuperación');
  });
});

describe('edad: solo birth_date, calendario real', () => {
  const now = day(2026, 8, 23);

  it('0D el día del nacimiento y unidades compactas', () => {
    assert.equal(compactAgeLabel('2026-08-23', now), 'Edad 0D');
    assert.equal(compactAgeLabel('2026-08-17', now), 'Edad 6D');
    assert.equal(compactAgeLabel('2026-08-16', now), 'Edad 1S');
    assert.equal(compactAgeLabel('2026-07-23', now), 'Edad 1M');
    assert.equal(compactAgeLabel('2025-08-23', now), 'Edad 1 AÑO');
    assert.equal(compactAgeLabel('2024-08-23', now), 'Edad 2 AÑOS');
    assert.equal(compactAgeLabel('2019-08-23', now), 'Edad 7 AÑOS');
  });

  it('no cumple año hasta el aniversario (10/09/2025 → 23/08/2026)', () => {
    const diff = calendarDiff(2025, 9, 10, 2026, 8, 23);
    assert.ok(diff);
    assert.equal(diff.years, 0);
    assert.equal(compactAgeLabel('2025-09-10', now), 'Edad 11M');
  });

  it('omite fecha inválida, futura o ausente', () => {
    assert.equal(compactAgeLabel(null, now), '');
    assert.equal(compactAgeLabel('2026-08-24', now), '');
    assert.equal(compactAgeLabel('no-fecha', now), '');
  });
});
