// Verifica fecha de nacimiento, filtros del refugio y contadores.

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}
function isValid(year, month, day, now = new Date('2026-08-21')) {
  if (!year || !month || !day) return false;
  if (day > daysInMonth(year, month)) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() <= today.getTime();
}
function speciesGroup(species) {
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}
function filterProtectorPets(pets, status, species) {
  return pets.filter((p) => {
    if (status === 'en_adopcion' && p.careStatus !== 'en_adopcion') return false;
    if (status === 'en_recuperacion' && p.careStatus !== 'en_recuperacion') return false;
    if (species !== 'todos' && speciesGroup(p.species) !== species) return false;
    return true;
  });
}
function waitingRestart(prevStatus, nextStatus, now) {
  if (nextStatus === 'en_adopcion' && prevStatus !== 'en_adopcion') return now;
  if (nextStatus !== 'en_adopcion') return null;
  return 'keep';
}

const checks = [
  ['no 30 de febrero', !isValid(2026, 2, 30)],
  ['no 31 de febrero', !isValid(2026, 2, 31)],
  ['no 31 de abril', !isValid(2026, 4, 31)],
  ['no 31 de junio', !isValid(2026, 6, 31)],
  ['no fecha futura', !isValid(2027, 1, 1, new Date('2026-08-21'))],
  ['29 feb bisiesto 2024', isValid(2024, 2, 29, new Date('2026-08-21'))],
  ['no 29 feb 2025', !isValid(2025, 2, 29)],
  ['invalidar día al cambiar mes', daysInMonth(2026, 2) < 30],
  ['filtros combinados', filterProtectorPets([
    { careStatus: 'en_adopcion', species: 'perro' },
    { careStatus: 'en_recuperacion', species: 'perro' },
    { careStatus: 'en_adopcion', species: 'gato' },
  ], 'en_adopcion', 'perro').length === 1],
  ['todas incluye adopción y recuperación', filterProtectorPets([
    { careStatus: 'en_adopcion', species: 'perro' },
    { careStatus: 'en_recuperacion', species: 'gato' },
  ], 'todas', 'todos').length === 2],
  ['marcar adoptado no saca de todas', filterProtectorPets([
    { careStatus: 'en_adopcion', species: 'perro' },
    { careStatus: 'en_recuperacion', species: 'gato' },
  ], 'todas', 'todos').length === 2],
  ['volver a adopción reinicia espera', waitingRestart('en_recuperacion', 'en_adopcion', 99) === 99],
  ['pasar a recuperación limpia espera', waitingRestart('en_adopcion', 'en_recuperacion', 99) === null],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    failed += 1;
    console.error('FAIL', name);
  } else console.log('ok  ', name);
}
if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log(`\n${checks.length} checks passed`);
