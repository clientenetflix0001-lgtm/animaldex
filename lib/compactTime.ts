/**
 * Unidades compactas D / S / M / AÑO para overlays de grilla.
 * Se calculan en cada render con la fecha actual. No se persisten en D1.
 * La validación de birth_date (isValidBirthDateParts) no se modifica:
 * aquí solo se acepta YYYY-MM-DD real y no futura, el mismo criterio.
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function calendarDiff(
  fromYear: number,
  fromMonth: number,
  fromDay: number,
  toYear: number,
  toMonth: number,
  toDay: number
): { years: number; months: number; days: number } | null {
  if (toYear < fromYear) return null;
  let years = toYear - fromYear;
  let months = toMonth - fromMonth;
  let days = toDay - fromDay;
  if (days < 0) {
    months -= 1;
    const prevMonth = toMonth === 1 ? 12 : toMonth - 1;
    const prevYear = toMonth === 1 ? toYear - 1 : toYear;
    days += daysInMonth(prevYear, prevMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  return { years, months, days };
}

/** 0D · 6D · 1S · 3S · 1M · 11M · 1 AÑO · 2 AÑOS */
export function formatCompactSpan(years: number, months: number, days: number): string {
  if (years >= 2) return `${years} AÑOS`;
  if (years === 1) return '1 AÑO';
  if (months >= 1) return `${months}M`;
  if (days >= 7) return `${Math.floor(days / 7)}S`;
  return `${Math.max(0, days)}D`;
}

function partsFromMs(ms: number): { year: number; month: number; day: number } {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function parseYmd(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Espera de adopción. Solo `adoption_started_at` (epoch ms). */
export function compactWaitFromStartedAt(
  startedAt: number | null | undefined,
  now: number = Date.now()
): string {
  if (!startedAt || !Number.isFinite(startedAt) || startedAt > now) return '';
  const from = partsFromMs(startedAt);
  const to = partsFromMs(now);
  const diff = calendarDiff(from.year, from.month, from.day, to.year, to.month, to.day);
  if (!diff) return '';
  return formatCompactSpan(diff.years, diff.months, diff.days);
}

export function adoptionStatusOverlay(
  careStatus: string | null | undefined,
  adoptionStartedAt?: number | null,
  now: number = Date.now()
): string {
  if (careStatus === 'en_recuperacion') return 'En recuperación';
  if (careStatus !== 'en_adopcion') return '';
  const wait = compactWaitFromStartedAt(adoptionStartedAt, now);
  return wait ? `En adopción · Esperando ${wait}` : 'En adopción';
}

/** Edad compacta. Solo `birth_date` YYYY-MM-DD. */
export function compactAgeLabel(
  birthDate: string | null | undefined,
  now: Date = new Date()
): string {
  const parsed = parseYmd(birthDate);
  if (!parsed || parsed.year < 1980) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const born = new Date(parsed.year, parsed.month - 1, parsed.day);
  if (born.getTime() > today.getTime()) return '';
  const diff = calendarDiff(
    parsed.year,
    parsed.month,
    parsed.day,
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
  if (!diff) return '';
  return `Edad ${formatCompactSpan(diff.years, diff.months, diff.days)}`;
}
