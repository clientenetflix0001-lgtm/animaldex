import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyIdentifier } from '../lib/phone.ts';
import { parsePushNav, pushNavDestination } from '../lib/pushPolicy.ts';
import { resolveAppLink } from '../lib/appLinks.ts';
import {
  PET_TRANSFER_PENDING_EXISTS,
  PET_TRANSFER_SELF_ERROR,
  PET_TRANSFER_STALE,
  PET_TRANSFER_USER_NOT_FOUND,
  adoptedCountAfterAccept,
  countsAsPageAdoption,
  externalWarning,
  isPersonalOwnership,
  pageToExternalAdoptionNote,
  pageToPersonalWarning,
  pendingBannerCopy,
  personalToPageWarning,
  recipientAcceptWarning,
  remappedCareStatus,
  sameOwnerSnapshot,
  transferAcceptedCopy,
  transferLookupAllowed,
  transferRejectedCopy,
  transferRequestedCopy,
  transferablePages,
} from '../lib/petTransfer.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const sheet = readFileSync(join(root, 'components/TransferPetSheet.tsx'), 'utf8');
const requestScreen = readFileSync(join(root, 'screens/PetTransferRequestScreen.tsx'), 'utf8');
const activity = readFileSync(join(root, 'screens/ActivityScreen.tsx'), 'utf8');
const migration = readFileSync(join(root, 'migrations/011_pet_transfer_requests.sql'), 'utf8');
const createPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
const stories = readFileSync(join(root, 'screens/StoryViewerScreen.tsx'), 'utf8');
const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

describe('UI owner buttons', () => {
  it('1-2. owner personal y Página ven Editar / Transferir / Eliminar', () => {
    assert.match(petProfile, /isMyPet && \(/);
    assert.match(petProfile, />Editar</);
    assert.match(petProfile, />Transferir</);
    assert.match(petProfile, />Eliminar</);
    assert.match(petProfile, /adminRow/);
    assert.match(petProfile, /flexDirection: 'row'/);
    assert.match(petProfile, /<TransferPetSheet/);
  });

  it('3. Archivar queda oculto en el perfil', () => {
    assert.doesNotMatch(petProfile, /Archivar/);
    assert.match(db, /archivePet:/);
    assert.match(action('archivePet'), /UPDATE pets SET archived_at/);
  });

  it('4. no-owner no ve Transferir', () => {
    const block = petProfile.slice(petProfile.indexOf('{isMyPet && ('));
    assert.match(block, /Transferir/);
    assert.match(petProfile, /const isMyPet = !demoPet && !!realPet && realPet.userId === user\?\.id/);
  });
});

describe('copy y ownership helpers', () => {
  it('personal vs página y warnings breves', () => {
    assert.equal(isPersonalOwnership(null), true);
    assert.equal(isPersonalOwnership(''), true);
    assert.equal(isPersonalOwnership('pr-1'), false);
    assert.equal(personalToPageWarning(), 'Esta mascota dejará Mis mascotas y pasará a la página seleccionada.');
    assert.equal(pageToPersonalWarning('APAN Salta'), 'Esta mascota dejará APAN Salta y pasará a Mis mascotas.');
    assert.equal(externalWarning(), 'La titularidad solo cambiará si la otra persona acepta.');
    assert.equal(
      pageToExternalAdoptionNote('APAN Salta'),
      'Si acepta, la mascota dejará APAN Salta y se registrará como adoptada.'
    );
    assert.equal(recipientAcceptWarning('Luchi'), 'Al aceptar, pasarás a administrar este perfil y su chapita QR.');
    assert.equal(pendingBannerCopy('Gabriela'), 'Esperando respuesta de Gabriela');
    assert.equal(pendingBannerCopy(null), 'Transferencia pendiente');
  });

  it('4. Empresa no entra al selector; solo protector', () => {
    const pages = transferablePages([
      { id: 'a', type: 'protector' },
      { id: 'b', type: 'business' },
      { id: 'c', type: 'personal' },
    ]);
    assert.deepEqual(pages.map((p) => p.id), ['a']);
    assert.match(action('createPet'), /owned\[0\]\.type !== 'protector'/);
    assert.match(action('transferPetInternal'), /owned\[0\]\.type !== 'protector'/);
  });
});

describe('interno personal ↔ Página', () => {
  it('5-10. personal → propia Página conserva id / .pet / QR y no inserta pet_transfers', () => {
    const internal = action('transferPetInternal');
    assert.match(internal, /target === 'page'/);
    assert.match(internal, /UPDATE pets SET profile_id = \?/);
    assert.match(internal, /adoptedIncrement: false/);
    assert.doesNotMatch(internal, /INSERT INTO pet_transfers/);
    assert.doesNotMatch(internal, /username =/);
    assert.match(sheet, /Transferir esta mascota a una de mis páginas/);
    assert.match(sheet, /personalToPageWarning/);
    assert.doesNotMatch(internal, /pet_tags/);
  });

  it('11-13. Página → Mis mascotas no suma Adoptados', () => {
    const internal = action('transferPetInternal');
    assert.match(internal, /target === 'personal'/);
    assert.match(internal, /profile_id = NULL/);
    assert.equal(countsAsPageAdoption({ sourceProfileId: 'pr-1', kind: 'internal' }), false);
    assert.equal(adoptedCountAfterAccept(4, 'pr-1'), 5);
    assert.equal(adoptedCountAfterAccept(4, null), 4);
    assert.match(sheet, /Transferir perfil a Mis mascotas/);
    assert.match(sheet, /pageToPersonalWarning/);
  });
});

describe('externa: lookup y pending', () => {
  it('14-15. lookup email y teléfono', () => {
    const lookup = action('lookupTransferRecipient');
    assert.match(lookup, /findTransferRecipient/);
    assert.match(worker, /classified.kind === 'email'/);
    assert.match(worker, /findUsersByPhone/);
    assert.equal(transferLookupAllowed(classifyIdentifier('gabi@example.com').kind), true);
    assert.equal(transferLookupAllowed(classifyIdentifier('3875197086').kind), true);
    assert.equal(transferLookupAllowed(classifyIdentifier('gabi.user').kind), false);
    assert.match(sheet, /Correo electrónico/);
    assert.match(sheet, /Teléfono/);
  });

  it('16-17. no self-transfer y receptor inexistente', () => {
    const create = action('createPetTransferRequest');
    assert.match(create, /PET_TRANSFER_SELF_ERROR/);
    assert.match(create, /PET_TRANSFER_USER_NOT_FOUND/);
    assert.equal(PET_TRANSFER_SELF_ERROR.includes('vos mismo'), true);
    assert.equal(PET_TRANSFER_USER_NOT_FOUND.includes('No encontramos'), true);
  });

  it('18-20. pending no cambia ownership y segundo pending se rechaza', () => {
    const create = action('createPetTransferRequest');
    assert.match(create, /status = 'pending'/);
    assert.doesNotMatch(create, /UPDATE pets SET user_id/);
    assert.match(create, /PET_TRANSFER_PENDING_EXISTS/);
    assert.equal(PET_TRANSFER_PENDING_EXISTS.includes('pendiente'), true);
  });
});

describe('aceptar / rechazar', () => {
  it('21-27. accept cambia user_id, profile_id NULL, mismo pet', () => {
    const respond = action('respondPetTransfer');
    assert.match(respond, /recipient_user_id !== userId/);
    assert.match(respond, /UPDATE pets SET user_id = \?/);
    assert.match(respond, /profile_id = NULL/);
    assert.match(respond, /status = 'accepted'/);
    assert.match(respond, /sameOwnerSnapshot/);
    assert.equal(
      sameOwnerSnapshot(
        { userId: 'u1', profileId: 'p1' },
        { senderUserId: 'u1', sourceProfileId: 'p1' }
      ),
      true
    );
    assert.equal(
      sameOwnerSnapshot(
        { userId: 'u1', profileId: 'p2' },
        { senderUserId: 'u1', sourceProfileId: 'p1' }
      ),
      false
    );
    assert.doesNotMatch(respond, /PET_DELETE_TOMBSTONE_SQL/);
    assert.match(requestScreen, /Aceptar transferencia/);
    assert.match(requestScreen, /recipientAcceptConfirm/);
  });

  it('28-30. reject no toca ownership y notifica al sender', () => {
    const respond = action('respondPetTransfer');
    assert.match(respond, /decision === 'reject'/);
    assert.match(respond, /status = 'rejected'/);
    assert.doesNotMatch(respond.slice(respond.indexOf("decision === 'reject'"), respond.indexOf("decision !== 'accept'")), /UPDATE pets SET user_id/);
    assert.match(respond, /pet_transfer_rejected/);
    assert.match(respond, /transferRejectedCopy/);
    assert.equal(transferRejectedCopy('gabi', 'Luchi').title.includes('rechazó'), true);
  });
});

describe('Página → externo: Adoptados persistente', () => {
  it('31-34. +1 solo con transferencia externa accepted y source_profile_id', () => {
    assert.equal(countsAsPageAdoption({ sourceProfileId: 'pr-1', kind: 'external' }), true);
    assert.equal(countsAsPageAdoption({ sourceProfileId: null, kind: 'external' }), false);
    assert.equal(countsAsPageAdoption({ sourceProfileId: 'pr-1', kind: 'internal' }), false);
    const respond = action('respondPetTransfer');
    assert.match(respond, /INSERT INTO pet_transfers/);
    assert.match(respond, /countsAsPageAdoption/);
    assert.match(worker, /SELECT COUNT\(\*\) AS n FROM pet_transfers WHERE from_profile_id/);
    assert.doesNotMatch(respond, /care_status = 'adoptado'/);
    assert.equal(remappedCareStatus('en_adopcion', 'personal').careStatus, 'en_casa');
    assert.equal(remappedCareStatus('en_casa', 'page').careStatus, 'en_adopcion');
  });
});

describe('seguridad', () => {
  it('35-38. tercero, sender sin ownership y stale concurrente', () => {
    const respond = action('respondPetTransfer');
    assert.match(respond, /No podés responder esta solicitud/);
    assert.match(respond, /PET_TRANSFER_STALE/);
    const create = action('createPetTransferRequest');
    assert.match(create, /findOwnedPet/);
    assert.match(action('transferPetInternal'), /findOwnedPet/);
    assert.equal(PET_TRANSFER_STALE, 'Esta transferencia ya no está disponible.');
    assert.match(respond, /!pet/);
    assert.match(action('deletePet'), /DELETE FROM pets WHERE id/);
  });
});

describe('notificaciones', () => {
  it('39-41. requested / accepted / rejected reutilizan activity_events + push adoption', () => {
    assert.match(worker, /type: 'pet_transfer_requested'/);
    assert.match(worker, /type: 'pet_transfer_accepted'/);
    assert.match(worker, /type: 'pet_transfer_rejected'/);
    assert.match(worker, /type: 'adoption'/);
    assert.match(worker, /type: 'pet_transfer'/);
    assert.match(worker, /pet_transfer_requested', 'pet_transfer_accepted', 'pet_transfer_rejected/);
    assert.equal(transferRequestedCopy('Gabriela', 'Luchi').title, 'Gabriela quiere transferirte el perfil de Luchi.');
    assert.equal(transferAcceptedCopy('gabi', 'Luchi').title, 'gabi aceptó la transferencia de Luchi.');
    assert.match(activity, /pet_transfer_requested/);
    assert.match(activity, /PetTransferRequest/);
    assert.deepEqual(parsePushNav({ type: 'pet_transfer', requestId: 'ptr-1' }), {
      kind: 'pet_transfer',
      requestId: 'ptr-1',
    });
    assert.deepEqual(pushNavDestination({ type: 'pet_transfer', url: '/transfer/ptr-9' }), {
      name: 'PetTransferRequest',
      params: { requestId: 'ptr-9' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/transfer/ptr-9'), {
      screen: 'PetTransferRequest',
      params: { requestId: 'ptr-9' },
    });
  });
});

describe('regresiones', () => {
  it('42-48. delete, QR, .pet, posts, Stories V8, perfiles y ownership intactos', () => {
    const del = action('deletePet');
    assert.match(del, /petDeleteTombstoneRows/);
    assert.match(del, /DELETE FROM pets/);
    assert.match(worker, /username = \?/);
    assert.doesNotMatch(action('respondPetTransfer'), /author_user_id/);
    assert.doesNotMatch(action('transferPetInternal'), /author_user_id/);
    assert.match(stories, /stageShell|GestureDetector|StoryVideo/);
    assert.match(ownership, /isPersonalPet/);
    assert.match(ownership, /petBelongsToProfile/);
    assert.match(createPet, /profileId/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS pet_transfer_requests/);
    assert.match(migration, /idx_ptr_recipient_status/);
    assert.match(migration, /idx_ptr_sender_status/);
    assert.match(migration, /idx_ptr_pet_status/);
    assert.match(db, /createPetTransferRequest/);
    assert.match(db, /respondPetTransfer/);
    assert.match(db, /cancelPetTransferRequest/);
    assert.match(sheet, /Enviar solicitud/);
    assert.match(petProfile, /Transferencia pendiente/);
  });
});
