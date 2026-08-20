// Verifica contadores del perfil proteccionista y el filtro de pestañas.
// Mascotas = profile_id actual. Adoptados = transferencias, no care_status.

function isRecoveryStatus(careStatus) {
  return careStatus === 'en_recuperacion';
}
function belongsToAdoptionTab(careStatus) {
  return !isRecoveryStatus(careStatus);
}
function filterShelterPets(pets, tab) {
  if (tab === 'en_recuperacion') return pets.filter((p) => isRecoveryStatus(p.careStatus));
  if (tab === 'en_adopcion') return pets.filter((p) => belongsToAdoptionTab(p.careStatus));
  return [];
}

function shelterStats(pets, transfers, profileId) {
  return {
    pets: pets.filter((p) => p.profileId === profileId).length,
    adopted: transfers.filter((t) => t.fromProfileId === profileId).length,
  };
}

const shelter = 'refugio-apan';
const nina = { id: 'pet-nina', profileId: shelter, careStatus: 'en_recuperacion' };
const luna = { id: 'pet-luna', profileId: shelter, careStatus: 'en_adopcion' };
const markedAdoptedButStillThere = { id: 'pet-old', profileId: shelter, careStatus: 'adoptado' };
const alreadyTransferred = { id: 'pet-max', profileId: 'user-ana', careStatus: null };

const current = [nina, luna, markedAdoptedButStillThere];
const transfers = [{ petId: 'pet-max', fromProfileId: shelter }];

const stats = shelterStats([...current, alreadyTransferred], transfers, shelter);
const adoptionTab = filterShelterPets(current, 'en_adopcion').map((p) => p.id);
const recoveryTab = filterShelterPets(current, 'en_recuperacion').map((p) => p.id);
const adoptedTabFromStatus = filterShelterPets(current, 'adoptado');

const checks = [
  ['Mascotas cuenta en_adopcion + en_recuperacion + adoptado-sin-transferir', stats.pets === 3],
  ['Marcar adoptado NO baja Mascotas', stats.pets === 3],
  ['Adoptados solo sube con transferencia', stats.adopted === 1],
  ['En adopción incluye a la marcada adoptada que sigue en el refugio', adoptionTab.includes('pet-old') && adoptionTab.includes('pet-luna') && !adoptionTab.includes('pet-nina')],
  ['En recuperación solo tiene a Nina', recoveryTab.length === 1 && recoveryTab[0] === 'pet-nina'],
  ['La pestaña Adoptados no lista mascotas actuales por care_status', adoptedTabFromStatus.length === 0],
  ['La mascota transferida ya no cuenta en Mascotas', !current.find((p) => p.id === 'pet-max')],
  ['Tras transferir, Mascotas-1 y Adoptados+1', shelterStats([nina, luna], transfers, shelter).pets === 2 && shelterStats([nina, luna], transfers, shelter).adopted === 1],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    failed += 1;
    console.error('FAIL', name);
  } else {
    console.log('ok  ', name);
  }
}
if (failed) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log(`\n${checks.length} checks passed`);
