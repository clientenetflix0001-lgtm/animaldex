import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POST_PET_IDENTITY_ERROR,
  POST_PET_NOT_OWNED_ERROR,
  filterPersonalPets,
  petAllowedForAuthorIdentity,
  petsForPublishingIdentity,
  reconcileSelectedPetId,
} from '../lib/petOwnership.ts';
import { reelUploadLimited, filterReelsForFeed, reelBelongsInReelsFeed } from '../lib/reels.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mux = readFileSync(join(root, 'worker/reelsMux.js'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const trim = readFileSync(join(root, 'lib/reelTrim.ts'), 'utf8');
const overlays = readFileSync(join(root, 'lib/reelOverlays.ts'), 'utf8');
const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');

const ACCOUNT = 'u-lucas';
const personal = { id: 'pr-me', type: 'personal', accountId: ACCOUNT };
const apan = { id: 'pr-apan', type: 'protector', accountId: ACCOUNT };
const shop = { id: 'pr-shop', type: 'business', accountId: ACCOUNT };
const pageB = { id: 'pr-b', type: 'protector', accountId: ACCOUNT };

const nina = { id: 'nina', userId: ACCOUNT, profileId: null, careStatus: 'en_casa' };
const lunaPersonal = { id: 'luna', userId: ACCOUNT, profileId: 'pr-me', careStatus: 'en_adopcion' };
const firulais = { id: 'firu', userId: ACCOUNT, profileId: 'pr-apan', careStatus: 'en_casa' };
const shopPet = { id: 'sku', userId: ACCOUNT, profileId: 'pr-shop' };
const pageBPet = { id: 'milo', userId: ACCOUNT, profileId: 'pr-b' };
const allPets = [nina, lunaPersonal, firulais, shopPet, pageBPet];
const profiles = [personal, apan, shop, pageB];

function gate(partial: Parameters<typeof petAllowedForAuthorIdentity>[0]) {
  return petAllowedForAuthorIdentity({ accountId: ACCOUNT, ...partial });
}

function createReelUploadHandler() {
  const start = mux.indexOf("if (action === 'createReelUpload')");
  const end = mux.indexOf("if (action === 'completeReelUpload')");
  assert.ok(start >= 0 && end > start);
  return mux.slice(start, end);
}

describe('CreateReel: autorización identidad ↔ mascota', () => {
  it('1. Reel personal + mascota personal → OK', () => {
    assert.deepEqual(gate({ pet: nina, author: personal }), { ok: true });
    assert.deepEqual(gate({ pet: lunaPersonal, author: personal, petProfile: personal }), { ok: true });
  });

  it('2. Reel personal + profile_id NULL legacy → OK', () => {
    assert.deepEqual(gate({ pet: { userId: ACCOUNT, profileId: null }, author: personal }), { ok: true });
    assert.deepEqual(gate({ pet: { userId: ACCOUNT, profileId: '' }, author: personal }), { ok: true });
  });

  it('3. Reel personal + mascota protectora → 403', () => {
    assert.deepEqual(gate({ pet: firulais, author: personal, petProfile: apan }), {
      ok: false,
      code: 'identity_mismatch',
    });
  });

  it('4. Página A + mascota A → OK', () => {
    assert.deepEqual(gate({ pet: firulais, author: apan, petProfile: apan }), { ok: true });
  });

  it('5. Página A + mascota personal → 403', () => {
    assert.deepEqual(gate({ pet: nina, author: apan }), { ok: false, code: 'identity_mismatch' });
  });

  it('6. Página A + mascota B → 403', () => {
    assert.deepEqual(gate({ pet: pageBPet, author: apan, petProfile: pageB }), {
      ok: false,
      code: 'identity_mismatch',
    });
  });

  it('7. Página business + mascota propia → OK', () => {
    assert.deepEqual(gate({ pet: shopPet, author: shop, petProfile: shop }), { ok: true });
  });

  it('8. Página business + mascota personal → 403', () => {
    assert.deepEqual(gate({ pet: nina, author: shop }), { ok: false, code: 'identity_mismatch' });
  });

  it('9. Reel personal sin mascota → OK', () => {
    assert.deepEqual(gate({ pet: null, author: personal }), { ok: true });
    assert.deepEqual(gate({ author: personal }), { ok: true });
  });

  it('10. Página sin mascota → OK', () => {
    assert.deepEqual(gate({ pet: null, author: apan }), { ok: true });
    assert.deepEqual(gate({ author: shop }), { ok: true });
  });

  it('11. cambio de identidad limpia protagonista incompatible', () => {
    const personalPets = petsForPublishingIdentity(allPets, { profileId: 'pr-me', type: 'personal' }, profiles);
    const pagePets = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles);
    assert.equal(reconcileSelectedPetId('nina', personalPets), 'nina');
    assert.equal(reconcileSelectedPetId('nina', pagePets), null);
    assert.equal(reconcileSelectedPetId('firu', pagePets), 'firu');
    assert.equal(reconcileSelectedPetId('firu', personalPets), null);
    assert.match(createReel, /reconcileSelectedPetId\(current, pickerPets\)/);
    assert.match(createReel, /\[activeProfileId, pickerPets\]/);
  });

  it('12. selector personal muestra solo personales', () => {
    const shown = petsForPublishingIdentity(allPets, { profileId: 'pr-me', type: 'personal' }, profiles);
    assert.deepEqual(shown.map((p) => p.id).sort(), ['luna', 'nina']);
    assert.deepEqual(filterPersonalPets(allPets, profiles).map((p) => p.id).sort(), ['luna', 'nina']);
    assert.match(createReel, /petsForPublishingIdentity/);
    assert.match(createReel, /pickerPets\.map/);
    assert.doesNotMatch(createReel, /isOrg \? null : selectedPet/);
    assert.doesNotMatch(createReel, /!isOrg &&/);
  });

  it('13. selector Página muestra solo mascotas de esa Página', () => {
    const apanPets = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles);
    const shopPets = petsForPublishingIdentity(allPets, { profileId: 'pr-shop', type: 'business' }, profiles);
    const emptyShop = petsForPublishingIdentity(
      [nina, firulais],
      { profileId: 'pr-shop', type: 'business' },
      profiles
    );
    assert.deepEqual(apanPets.map((p) => p.id), ['firu']);
    assert.deepEqual(shopPets.map((p) => p.id), ['sku']);
    assert.deepEqual(emptyShop.map((p) => p.id), []);
  });

  it('14. care_status no afecta ownership', () => {
    assert.deepEqual(gate({ pet: lunaPersonal, author: personal, petProfile: personal }), { ok: true });
    assert.deepEqual(gate({ pet: firulais, author: personal, petProfile: apan }), {
      ok: false,
      code: 'identity_mismatch',
    });
    assert.doesNotMatch(ownership, /input\.pet\.care|pet\.careStatus/);
    assert.doesNotMatch(createReelUploadHandler(), /care_status|careStatus/);
  });
});

describe('CreateReel Worker: orden auth / ownership / rate-limit / Mux', () => {
  it('15. combinación inválida no llega a Mux', () => {
    const handler = createReelUploadHandler();
    const identity = handler.indexOf('petAllowedForAuthorIdentity');
    const muxCall = handler.indexOf("muxApi(env, '/video/v1/uploads'");
    const identityReturn = handler.indexOf('POST_PET_IDENTITY_ERROR');
    assert.ok(identity >= 0 && muxCall > identity);
    assert.ok(identityReturn >= 0 && muxCall > identityReturn);
    assert.match(mux, /from '\.\.\/lib\/petOwnership\.ts'/);
    assert.equal(
      POST_PET_IDENTITY_ERROR,
      'La mascota seleccionada no pertenece al perfil o página desde la que estás publicando.'
    );
  });

  it('16. combinación inválida no consume reel_upload_attempt', () => {
    const handler = createReelUploadHandler();
    const identity = handler.indexOf('petAllowedForAuthorIdentity');
    const attempt = handler.indexOf('INSERT INTO reel_upload_attempts');
    assert.ok(identity >= 0 && attempt > identity);
    assert.ok(handler.indexOf('POST_PET_IDENTITY_ERROR') < attempt);
    assert.ok(handler.indexOf('POST_PET_NOT_OWNED_ERROR') < attempt);
  });

  it('17. combinación válida conserva rate limit existente', () => {
    assert.equal(reelUploadLimited(4, 10), false);
    assert.equal(reelUploadLimited(5, 10), true);
    assert.equal(reelUploadLimited(1, 15), true);
    const handler = createReelUploadHandler();
    const identity = handler.indexOf('petAllowedForAuthorIdentity');
    const limited = handler.indexOf('reelUploadLimited');
    const attempt = handler.indexOf('INSERT INTO reel_upload_attempts');
    const muxCall = handler.indexOf("muxApi(env, '/video/v1/uploads'");
    assert.ok(limited > identity && attempt > limited && muxCall > attempt);
    assert.match(handler, /REEL_UPLOADS_PER_HOUR/);
    assert.match(handler, /REEL_UPLOADS_PER_DAY/);
  });

  it('18. ready/playback gating sigue funcionando', () => {
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: 'pb' }), true);
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: '' }), false);
  });

  it('19. uploading/processing/failed siguen invisibles', () => {
    assert.equal(reelBelongsInReelsFeed({ status: 'uploading', playbackId: 'pb' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'processing', playbackId: 'pb' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'failed', playbackId: 'pb' }), false);
    assert.deepEqual(
      filterReelsForFeed([
        { id: 'ok', status: 'ready', playbackId: 'pb' },
        { id: 'up', status: 'uploading', playbackId: null },
        { id: 'pr', status: 'processing', playbackId: 'pb' },
      ]).map((r) => r.id),
      ['ok']
    );
  });

  it('20. trim/text overlays siguen sin afectar ownership', () => {
    assert.match(createReel, /openReelTrimEditor/);
    assert.match(createReel, /parseReelOverlays/);
    assert.match(trim, /showEditor/);
    assert.match(overlays, /createDraftOverlay|ReelTextOverlay/);
    assert.doesNotMatch(trim, /petAllowedForAuthorIdentity|petsForPublishingIdentity/);
    assert.doesNotMatch(overlays, /petAllowedForAuthorIdentity|petsForPublishingIdentity/);
    assert.match(mux, /authorizeOwnedPetId/);
    assert.match(mux, /authorizeOwnedProfileId/);
    assert.equal(POST_PET_NOT_OWNED_ERROR, 'Esa mascota no es tuya');
  });
});
