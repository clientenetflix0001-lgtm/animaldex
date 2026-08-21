export const MONTHS = [
  { n: 1, label: 'Enero' },
  { n: 2, label: 'Febrero' },
  { n: 3, label: 'Marzo' },
  { n: 4, label: 'Abril' },
  { n: 5, label: 'Mayo' },
  { n: 6, label: 'Junio' },
  { n: 7, label: 'Julio' },
  { n: 8, label: 'Agosto' },
  { n: 9, label: 'Septiembre' },
  { n: 10, label: 'Octubre' },
  { n: 11, label: 'Noviembre' },
  { n: 12, label: 'Diciembre' },
] as const;

export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 1) return false;
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function parseBirthDate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const s = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function formatBirthDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function isValidBirthDateParts(
  year: number | null,
  month: number | null,
  day: number | null,
  now: Date = new Date()
): boolean {
  if (!year || !month || !day) return false;
  if (year < 1980 || year > now.getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() <= today.getTime();
}

export function isValidBirthDateString(value: string | null | undefined, now: Date = new Date()): boolean {
  const parsed = parseBirthDate(value);
  if (!parsed) return false;
  return isValidBirthDateParts(parsed.year, parsed.month, parsed.day, now);
}

export function ageLabelFromBirthDate(value: string | null | undefined, now: Date = new Date()): string {
  const parsed = parseBirthDate(value);
  if (!parsed || !isValidBirthDateParts(parsed.year, parsed.month, parsed.day, now)) return '';
  let years = now.getFullYear() - parsed.year;
  let months = now.getMonth() + 1 - parsed.month;
  let days = now.getDate() - parsed.day;
  if (days < 0) {
    months -= 1;
    days += daysInMonth(now.getFullYear(), now.getMonth() === 0 ? 12 : now.getMonth());
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';
  if (years >= 1) return years === 1 ? '1 año' : `${years} años`;
  if (months >= 1) return months === 1 ? '1 mes' : `${months} meses`;
  if (days <= 1) return 'Recién nacido';
  return `${days} días`;
}
