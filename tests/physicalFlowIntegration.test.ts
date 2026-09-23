import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { guestTagWelcomeHome, publicTagTargetFromStatus } from '../lib/tagPublicResolve.ts';
import {
  QR_LINK_EXISTING_PET_HELP,
  QR_LINK_EXISTING_PET_LABEL,
  QR_REGISTER_NEW_PET_HELP,
  QR_REGISTER_NEW_PET_LABEL,
  QR_REGISTER_PAGE_PET_HELP,
  QR_REGISTER_PAGE_PET_LABEL,
  existingPetsForQr,
  pageSourceForQrContact,
  qrContactStep,
  qrPageOptionVisible,
  qrWelcomeChoices,
} from '../lib/qrTagLink.ts';
import { addPetParamsForPageQr, addPetParamsForPersonalQr } from '../lib/qrPageRegister.ts';
import {
  ACCOUNT_VERIFIED_AVAILABLE,
  ownerCardIdentityLabel,
  ownerCardModel,
  ownerCardShowsVerifiedBadge,
  publicOwnerContactPayload,
  publicPayloadContainsStoredPhone,
  publicPetProfileContactJson,
  userContactSource,
} from '../lib/petOwnerContact.ts';
import { persistableBreedId, suggestBreeds } from '../lib/breeds.ts';
import {
  lostBreedMatchActivityCopy,
  lostBreedMatchGroupKey,
  lostBreedMatchIdempotencyKey,
  lostFoundBreedMatch,
  pickLostBreedMatchTargets,
} from '../lib/lostBreedMatch.ts';
import { PUSH_KIND, decidePushDelivery, pushBatchWindowMs } from '../lib/pushCenter.ts';
import { alertTypeFromCreatePrimary } from '../lib/alerts.ts';
import { createChooserOpen } from '../lib/createChooser.ts';
import { relaunchSchemePair, schemeFromSystemAppearance } from '../lib/themeRuntime.ts';
import { THEME_PREFERENCE } from '../lib/appTheme.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const petProfile = read('screens/PetProfileScreen.tsx');
const welcome = read('screens/TagWelcomeScreen.tsx');
const app = read('App.tsx');
const createAlert = read('screens/CreateAlertScreen.tsx');
const alerts = read('screens/AlertsScreen.tsx');
const worker = read('worker/index.js');
const feed = read('screens/FeedScreen.tsx');
const feedSwiper = read('screens/FeedReelsSwiper.tsx');
const chooser = read('screens/CreateChooserScreen.tsx');
const provider = read('lib/ThemeProvider.tsx');

const claimedGuest = publicTagTargetFromStatus('6544FF', {
  exists: true,
  status: 'claimed',
  pet: { id: 'pet-1' },
});

describe('flujo real: QR claimed → PetProfile → owner card', () => {
  it('1. QR claimed guest abre PetProfile y la owner card nueva', () => {
    assert.deepEqual(claimedGuest, { kind: 'pet', petId: 'pet-1' });
    assert.match(welcome, /navigation\.replace\('PetProfile', \{ petId: target\.petId, fromQr: true \}\)/);
    assert.match(app, /name="PetProfile"/);
    assert.match(app, /PublicNavigator[\s\S]*name="PetProfile"|name="PetProfile"[\s\S]*PublicNavigator|function PublicNavigator[\s\S]*PetProfileScreen/);
    assert.match(petProfile, /ownerCardModel/);
    assert.match(petProfile, /logo-whatsapp/);
    assert.match(petProfile, /accessibilityLabel="Teléfono"/);
    assert.doesNotMatch(welcome, /ownerName \}/);
  });

  it('2. owner card no muestra nombre real', () => {
    const card = ownerCardModel({
      ownerUsername: 'lucasfuentes',
      ownerName: 'Lucas Fuentes',
      ownerContact: null,
    });
    assert.equal(card.identity, 'lucasfuentes');
    assert.notEqual(card.identity, 'Lucas Fuentes');
    assert.equal(ownerCardIdentityLabel({ ownerUsername: 'lucasfuentes', ownerName: 'Lucas Fuentes' }), 'lucasfuentes');
    assert.doesNotMatch(petProfile, /\{ownerName\} · \{ownerUsername\}/);
    assert.doesNotMatch(petProfile, / Humano de /);
    assert.match(petProfile, /ownerVerifiedSlot/);
    assert.equal(ACCOUNT_VERIFIED_AVAILABLE, false);
    assert.equal(ownerCardShowsVerifiedBadge({ verified: true }), false);
  });

  it('3. ownerContact invisible → cero botones', () => {
    const payload = publicPetProfileContactJson({
      user: {
        username: 'lucasfuentes',
        name: 'Lucas Fuentes',
        contactWhatsapp: '+5493875551111',
        contactPhone: '+5493875552222',
        petContactVisible: 0,
      },
    });
    const card = ownerCardModel({
      ownerUsername: 'lucasfuentes',
      ownerName: 'Lucas Fuentes',
      ownerContact: payload.ownerContact,
    });
    assert.equal(card.showWhatsapp, false);
    assert.equal(card.showPhone, false);
    assert.equal(payload.ownerContact?.whatsapp, null);
    assert.equal(payload.ownerContact?.phone, null);
  });

  it('4. visible WhatsApp → botón WA', () => {
    const payload = publicPetProfileContactJson({
      user: { username: 'lucasfuentes', contactWhatsapp: '3875551234', petContactVisible: 1 },
    });
    const card = ownerCardModel({ ownerUsername: 'lucasfuentes', ownerContact: payload.ownerContact });
    assert.equal(card.showWhatsapp, true);
    assert.equal(card.showPhone, false);
    assert.equal(card.whatsappUrl, 'https://wa.me/5493875551234');
    assert.match(petProfile, /WHATSAPP_GREEN/);
  });

  it('5. visible teléfono → botón call', () => {
    const payload = publicPetProfileContactJson({
      user: { username: 'lucasfuentes', contactPhone: '+5493875559999', petContactVisible: 1 },
    });
    const card = ownerCardModel({ ownerUsername: 'lucasfuentes', ownerContact: payload.ownerContact });
    assert.equal(card.showPhone, true);
    assert.equal(card.phoneUrl, 'tel:+5493875559999');
    assert.match(petProfile, /PHONE_ORANGE/);
  });

  it('6. PAGE usa contacto de la página, no del admin', () => {
    const payload = publicPetProfileContactJson({
      petProfileId: 'prf-1',
      page: {
        id: 'prf-1',
        username: 'abdulprotege',
        adoptionWhatsapp: '+5493875553333',
        phone: '3875554444',
        petContactVisible: 1,
      },
      user: {
        username: 'lucasfuentes',
        contactWhatsapp: '+5493870000000',
        petContactVisible: 1,
      },
    });
    const card = ownerCardModel({
      shelterUsername: 'abdulprotege',
      ownerUsername: 'lucasfuentes',
      ownerName: 'Lucas Fuentes',
      ownerContact: payload.ownerContact,
    });
    assert.equal(card.identity, 'abdulprotege');
    assert.equal(payload.ownerContact?.kind, 'page');
    assert.equal(payload.ownerContact?.whatsapp, '+5493875553333');
    assert.notEqual(payload.ownerContact?.whatsapp, '+5493870000000');
    assert.match(worker, /contactSourceForPet/);
    assert.match(worker, /publicOwnerContactPayload/);
  });

  it('7. PAGE hidden → API no filtra la mascota; no filtra números', () => {
    const stored = '+5493875553333';
    const payload = publicPetProfileContactJson({
      petProfileId: 'prf-1',
      page: {
        username: 'abdulprotege',
        adoptionWhatsapp: stored,
        petContactVisible: 0,
      },
    });
    assert.ok(payload.ownerContact);
    assert.equal(payload.ownerContact?.whatsapp, null);
    assert.equal(payload.ownerContact?.phone, null);
    assert.equal(publicPayloadContainsStoredPhone(payload, stored), false);
    assert.equal(payload.shelter?.phone, '');
  });
});

describe('flujo real: QR unclaimed → 3 caminos → claim', () => {
  it('8. unclaimed + página → tres opciones en TagWelcome', () => {
    assert.deepEqual(qrWelcomeChoices([{ type: 'protector' }]), ['new_personal', 'existing', 'new_page']);
    assert.equal(qrPageOptionVisible([{ type: 'protector' }]), true);
    assert.match(welcome, /QR_REGISTER_NEW_PET_LABEL/);
    assert.match(welcome, /QR_LINK_EXISTING_PET_LABEL/);
    assert.match(welcome, /qrPageOptionVisible\(profiles\)/);
    assert.equal(QR_REGISTER_NEW_PET_LABEL, 'Registrar una mascota nueva');
    assert.equal(QR_REGISTER_NEW_PET_HELP, 'Creá el perfil de tu mascota y vinculá esta chapita.');
    assert.equal(QR_LINK_EXISTING_PET_LABEL, 'Vincular a una mascota existente');
    assert.equal(QR_LINK_EXISTING_PET_HELP, 'Elegí una mascota que ya tenés registrada en Animaldex.');
    assert.equal(QR_REGISTER_PAGE_PET_LABEL, 'Registrar una mascota en mi página');
    assert.equal(QR_REGISTER_PAGE_PET_HELP, 'Creá una mascota dentro de una de tus páginas y vinculá esta chapita.');
  });

  it('9. unclaimed sin página → dos opciones', () => {
    assert.deepEqual(qrWelcomeChoices([]), ['new_personal', 'existing']);
    assert.equal(qrPageOptionVisible([{ type: 'business' }]), false);
    const unclaimed = publicTagTargetFromStatus('AAA123', { exists: true, status: 'unclaimed' });
    assert.equal(unclaimed.kind, 'claim');
    assert.equal(guestTagWelcomeHome(false), 'Auth');
    assert.match(welcome, /setPendingTagCode\(code\)/);
    assert.match(welcome, /navigation\.replace\('Auth'/);
  });

  it('10. vincular existente llega a claimTag', () => {
    assert.match(welcome, /startChoice\('existing'\)/);
    assert.match(welcome, /setPageView\('pick-existing'\)/);
    assert.match(welcome, /db\.claimTag\(code, petId\)/);
    assert.deepEqual(existingPetsForQr([{ id: 'a' }, { id: 'b', archivedAt: 1 }]).map((p) => p.id), ['a']);
  });

  it('11. mascota nueva llega al claim personal', () => {
    assert.match(welcome, /startChoice\('new_personal'\)/);
    assert.match(welcome, /addPetParamsForPersonalQr\(code\)/);
    assert.deepEqual(addPetParamsForPersonalQr('AAA123'), { tagCode: 'AAA123' });
    assert.equal(qrContactStep({}), 'full');
    assert.equal(qrContactStep({ contactWhatsapp: '+5493875551111' }), 'visibility');
    assert.match(welcome, /qrContactStep/);
    assert.match(welcome, /PET_CONTACT_VISIBLE_LABEL/);
  });

  it('12. mascota en página llega al claim de página', () => {
    assert.match(welcome, /addPetParamsForPageQr\(code, page\.id\)/);
    assert.deepEqual(addPetParamsForPageQr('AAA123', 'prf-1'), { tagCode: 'AAA123', profileId: 'prf-1' });
    const page = pageSourceForQrContact({
      adoptionWhatsapp: '+5493875553333',
      phone: null,
    } as never);
    assert.equal(qrContactStep(page), 'visibility');
    assert.doesNotMatch(welcome, /qrPageRegisterView\(pages\) &&/);
    const invalid = publicTagTargetFromStatus('ZZZ', { exists: false });
    assert.equal(invalid.kind, 'unavailable');
    assert.match(welcome, /TAG_UNAVAILABLE_TITLE/);
  });
});

describe('flujo real: Alertas → CreateAlert → BreedPicker → match', () => {
  it('13. Lost muestra BreedPicker en CreateAlert real', () => {
    assert.equal(alertTypeFromCreatePrimary('lost', null), 'lost');
    assert.match(createAlert, /useState<AlertCreatePrimaryId>\('lost'\)/);
    assert.match(alerts, /navigate\('CreateAlert'\)/);
    assert.match(createAlert, /<BreedPicker/);
    assert.match(createAlert, /type === 'lost'/);
    assert.equal(createChooserOpen('flyer').screen, 'CreateFlyerDraft');
    assert.doesNotMatch(chooser, /Alerta/);
  });

  it('14. Found muestra BreedPicker', () => {
    assert.equal(alertTypeFromCreatePrimary('seen-or-found', 'found'), 'found');
    assert.match(createAlert, /type === 'found'/);
    assert.match(createAlert, /Raza \(si la reconocés\)/);
    assert.match(createAlert, /allowUnknown/);
  });

  it('15. escribir cani devuelve Caniche', () => {
    const hits = suggestBreeds('cani', 'perro');
    assert.equal(hits[0]?.id, 'poodle');
    assert.equal(hits[0]?.label, 'Caniche');
  });

  it('16. raza seleccionada persiste breed_id', () => {
    assert.equal(persistableBreedId('poodle', 'perro'), 'poodle');
    assert.equal(persistableBreedId('cani', 'perro'), null);
    assert.match(createAlert, /setBreedId\(id\)/);
    assert.match(worker, /breedIdInsertFragment/);
    assert.match(worker, /body\.breedId/);
  });

  it('17. Found crea lost_breed_match', () => {
    const lost = {
      id: 'lost-1',
      userId: 'owner-1',
      type: 'lost',
      status: 'active',
      species: 'perro',
      breedId: 'poodle',
      locality: 'Salta Capital',
      placeId: 'AR:georef:66028050',
    };
    const found = { ...lost, id: 'found-1', userId: 'lucas', type: 'found' };
    assert.equal(lostFoundBreedMatch(lost, found), true);
    assert.match(worker, /type === 'found' && breedId/);
    assert.match(worker, /recordLostBreedMatches/);
    assert.match(worker, /schedulePushCenterWork\(ctx, recordLostBreedMatches/);
  });

  it('18. Activity se genera inmediatamente', () => {
    assert.equal(
      lostBreedMatchActivityCopy({ actorUsername: 'lucasfuentes', breedId: 'poodle' }).body,
      'lucasfuentes reportó un Caniche encontrado cerca de tu zona.'
    );
    assert.match(worker, /INSERT OR IGNORE INTO activity_events/);
    assert.match(worker, /lostBreedMatchActivityCopy/);
    assert.doesNotMatch(worker, /Encontramos tu mascota/);
  });

  it('19. Push se encola 60 min', () => {
    assert.equal(pushBatchWindowMs(PUSH_KIND.LOST_BREED_MATCH), 60 * 60_000);
    assert.equal(
      decidePushDelivery({ kind: PUSH_KIND.LOST_BREED_MATCH, actorId: 'a', recipientId: 'b', now: 1 }).action,
      'enqueue'
    );
  });

  it('20. segundo evento compatible agrupa', () => {
    const keyA = lostBreedMatchGroupKey({
      recipientUserId: 'u1',
      lostAlertId: 'lost-1',
      breedId: 'poodle',
      lost: { placeId: 'AR:georef:66028050', locality: 'Salta Capital' },
    });
    const keyB = lostBreedMatchGroupKey({
      recipientUserId: 'u1',
      lostAlertId: 'lost-1',
      breedId: 'poodle',
      lost: { placeId: 'AR:georef:66028050', locality: 'Salta Capital' },
    });
    assert.equal(keyA, keyB);
    assert.equal(keyA, 'lost_breed_match:u1:lost-1:poodle:place:AR:georef:66028050');
    assert.equal(
      lostBreedMatchIdempotencyKey({ foundAlertId: 'f1', lostAlertId: 'lost-1', recipientUserId: 'u1' }),
      'lost_breed_match:f1:lost-1:u1'
    );
  });

  it('21. localidades diferentes no agrupan', () => {
    const a = lostBreedMatchGroupKey({
      recipientUserId: 'u1',
      lostAlertId: 'lost-1',
      breedId: 'poodle',
      lost: { placeId: 'AR:salta', locality: 'Salta Capital' },
    });
    const b = lostBreedMatchGroupKey({
      recipientUserId: 'u1',
      lostAlertId: 'lost-1',
      breedId: 'poodle',
      lost: { placeId: 'AR:cafa', locality: 'Cafayate' },
    });
    assert.notEqual(a, b);
    assert.equal(
      lostFoundBreedMatch(
        {
          id: 'lost-1',
          userId: 'o',
          type: 'lost',
          status: 'active',
          species: 'perro',
          breedId: 'poodle',
          locality: 'Salta Capital',
          placeId: 'AR:salta',
        },
        {
          id: 'found-1',
          userId: 'x',
          type: 'found',
          species: 'perro',
          breedId: 'poodle',
          locality: 'Cafayate',
          placeId: 'AR:cafa',
        }
      ),
      false
    );
  });

  it('22. resolved lost no matchea', () => {
    assert.equal(
      lostFoundBreedMatch(
        {
          id: 'lost-1',
          userId: 'o',
          type: 'lost',
          status: 'resolved',
          resolvedAt: 9,
          species: 'perro',
          breedId: 'poodle',
          locality: 'Salta Capital',
          placeId: 'AR:x',
        },
        {
          id: 'found-1',
          userId: 'x',
          type: 'found',
          species: 'perro',
          breedId: 'poodle',
          locality: 'Salta Capital',
          placeId: 'AR:x',
        }
      ),
      false
    );
  });

  it('23. self no matchea', () => {
    const lost = {
      id: 'lost-1',
      userId: 'lucas',
      type: 'lost',
      status: 'active',
      species: 'perro',
      breedId: 'poodle',
      locality: 'Salta Capital',
      placeId: 'AR:x',
    };
    assert.deepEqual(pickLostBreedMatchTargets({ ...lost, id: 'found-1', type: 'found' }, [lost], 'lucas'), []);
  });
});

describe('flujo real: ThemeProvider system-only', () => {
  it('24. system dark → dark', () => {
    assert.equal(schemeFromSystemAppearance('dark'), 'dark');
    assert.equal(THEME_PREFERENCE, 'system');
  });

  it('25. system light → light', () => {
    assert.equal(schemeFromSystemAppearance('light'), 'light');
    assert.equal(schemeFromSystemAppearance(null), 'light');
  });

  it('26. relaunch no cambia dark → light por sí solo', () => {
    const same = relaunchSchemePair('dark', 'dark');
    assert.equal(same.first, 'dark');
    assert.equal(same.second, 'dark');
    assert.equal(same.flippedWithoutSystemChange, false);
    const lock = relaunchSchemePair('dark', 'light');
    assert.equal(lock.flippedWithoutSystemChange, false);
    assert.match(provider, /AppState\.addEventListener/);
    assert.doesNotMatch(provider, /AsyncStorage|SecureStore|localStorage/);
    assert.match(app, /<ThemeProvider>/);
    assert.match(app, /ThemedAppShell/);
  });

  it('27. Feed no recibe listeners nuevos', () => {
    assert.doesNotMatch(feed, /Appearance\.addChangeListener/);
    assert.doesNotMatch(feed, /useColorScheme\(/);
    assert.doesNotMatch(feedSwiper, /Appearance\.addChangeListener/);
    assert.doesNotMatch(feedSwiper, /recordLostBreedMatches/);
    assert.doesNotMatch(worker, /action === 'feed'[\s\S]{0,400}recordLostBreedMatches/);
  });
});

describe('updatePetContact no borra números al toglear visibilidad', () => {
  it('preserva whatsapp/phone si el body no los manda', () => {
    const block = worker.slice(worker.indexOf("if (action === 'updatePetContact')"));
    assert.match(block, /body\.contactWhatsapp !== undefined \? parsed\.whatsapp : prev\.contactWhatsapp/);
    assert.match(block, /body\.petContactVisible !== undefined \? !!body\.petContactVisible : prev\.petContactVisible/);
  });
});
