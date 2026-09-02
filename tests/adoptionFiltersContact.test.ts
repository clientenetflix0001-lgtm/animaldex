import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADOPTION_CONTACT_INVALID,
  ADOPTION_CONTACT_MISSING,
  ADOPTION_CONTACT_REQUIRED,
  adoptCtaLabel,
  adoptionInquiryMessage,
  buildTelUrl,
  buildWhatsAppUrl,
  parseProtectorAdoptionContact,
  resolveAdoptionOpenAction,
} from '../lib/adoptionContact.ts';
import {
  ADOPTION_SPECIES_MENU,
  adoptionFilterMenu,
  adoptionTriggerLabel,
  matchesAdoptionFilters,
  nextOpenAdoptionFilter,
  type AdoptionCard,
} from '../lib/adoptionDiscovery.ts';
import { petAllowedForAuthorIdentity } from '../lib/petOwnership.ts';
import { isValidPetUsername } from '../lib/petHandles.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const discovery = readFileSync(join(root, 'screens/AdoptionDiscoveryScreen.tsx'), 'utf8');
const cardSrc = readFileSync(join(root, 'components/AdoptionDiscoveryCard.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const createSheet = readFileSync(join(root, 'features/profiles/CreateProfileSheet.tsx'), 'utf8');
const editPage = readFileSync(join(root, 'screens/EditPublicProfileScreen.tsx'), 'utf8');
const migration = readFileSync(join(root, 'migrations/006_protector_adoption_contact.sql'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

function card(overrides: Partial<AdoptionCard> = {}): AdoptionCard {
  return {
    id: 'pet:good',
    source: 'protector_pet',
    petId: 'good',
    petUsername: 'good.pet',
    name: 'Good',
    photo: null,
    birthDate: null,
    careStatus: 'en_adopcion',
    adoptionStartedAt: 1,
    size: 'mediano',
    sex: 'macho',
    species: 'perro',
    shelterProfileId: 'prf-apan',
    shelterName: 'APAN Salta',
    shelterUsername: 'apansalta',
    shelterAvatar: null,
    shelterLocation: null,
    shelterLocality: 'Salta Capital',
    createdAt: 10,
    ...overrides,
  };
}

describe('filtros compactos Adoptar', () => {
  it('1. inicial muestra Mascota / Porte / Sexo', () => {
    assert.equal(adoptionTriggerLabel('species', 'todos'), 'Mascota');
    assert.equal(adoptionTriggerLabel('size', 'todos'), 'Porte');
    assert.equal(adoptionTriggerLabel('sex', 'todos'), 'Sexo');
    assert.match(discovery, /adoptionTriggerLabel\('species', species\)/);
    assert.match(discovery, /adoptionTriggerLabel\('size', size\)/);
    assert.match(discovery, /adoptionTriggerLabel\('sex', sex\)/);
    assert.match(discovery, /\{label\} ▼/);
  });

  it('2. Mascota abre opciones correctas', () => {
    assert.deepEqual(
      ADOPTION_SPECIES_MENU.map((x) => x.label),
      ['Todos', '🐶 Perros', '🐱 Gatos', 'Otros']
    );
    assert.deepEqual(adoptionFilterMenu('species').map((x) => x.id), ['todos', 'perro', 'gato', 'otro']);
    assert.match(discovery, /adoptionFilterMenu\(openFilter\)/);
  });

  it('3. Gatos → botón muestra Gatos', () => {
    assert.equal(adoptionTriggerLabel('species', 'gato'), 'Gatos');
  });

  it('4. Todos → vuelve a Mascota', () => {
    assert.equal(adoptionTriggerLabel('species', 'todos'), 'Mascota');
  });

  it('5. Pequeño → botón muestra Pequeño', () => {
    assert.equal(adoptionTriggerLabel('size', 'pequeno'), 'Pequeño');
  });

  it('6. Todos → vuelve a Porte', () => {
    assert.equal(adoptionTriggerLabel('size', 'todos'), 'Porte');
  });

  it('7. Hembra → botón muestra Hembra', () => {
    assert.equal(adoptionTriggerLabel('sex', 'hembra'), 'Hembra');
  });

  it('8. Todos → vuelve a Sexo', () => {
    assert.equal(adoptionTriggerLabel('sex', 'todos'), 'Sexo');
  });

  it('9. seleccionar contrae', () => {
    assert.match(discovery, /setOpenFilter\(null\)/);
    assert.match(discovery, /if \(openFilter === 'species'\) setSpecies/);
    assert.match(discovery, /if \(openFilter === 'size'\) setSize/);
    assert.match(discovery, /if \(openFilter === 'sex'\) setSex/);
  });

  it('10. abrir otro cierra anterior', () => {
    assert.equal(nextOpenAdoptionFilter(null, 'species'), 'species');
    assert.equal(nextOpenAdoptionFilter('species', 'size'), 'size');
    assert.equal(nextOpenAdoptionFilter('size', 'size'), null);
    assert.match(discovery, /nextOpenAdoptionFilter\(cur, 'species'\)/);
    assert.match(discovery, /nextOpenAdoptionFilter\(cur, 'size'\)/);
    assert.match(discovery, /nextOpenAdoptionFilter\(cur, 'sex'\)/);
    assert.match(discovery, /Cerrar filtros/);
  });

  it('11. filtros siguen afectando resultados', () => {
    const dogs = card({ petId: 'd', species: 'perro' });
    const cats = card({ petId: 'c', species: 'gato', sex: 'hembra' });
    assert.equal(matchesAdoptionFilters(dogs, { species: 'gato', size: 'todos', sex: 'todos' }), false);
    assert.equal(matchesAdoptionFilters(cats, { species: 'gato', size: 'todos', sex: 'todos' }), true);
    assert.match(discovery, /\.\.\.filters,\s*locality: targetLocality/);
    assert.match(action('adoptionFeed'), /p\.species = \?/);
  });

  it('12. ubicación intacta', () => {
    assert.match(discovery, /LocalityPicker/);
    assert.match(discovery, /Salta Capital|locality \|\| 'Elegir localidad'/);
    assert.match(discovery, /saveAdoptionLocality/);
    assert.equal(
      matchesAdoptionFilters(card(), {
        species: 'todos',
        size: 'todos',
        sex: 'todos',
        locality: 'Salta Capital',
      }),
      true
    );
    assert.equal(
      matchesAdoptionFilters(card({ shelterLocality: 'Cafayate' }), {
        species: 'todos',
        size: 'todos',
        sex: 'todos',
        locality: 'Salta Capital',
      }),
      false
    );
  });

  it('filtros a la derecha, una fila compacta, sin 3 filas gigantes', () => {
    assert.match(discovery, /alignItems: 'flex-end'/);
    assert.match(discovery, /justifyContent: 'flex-end'/);
    assert.match(discovery, /flexWrap: 'wrap'/);
    assert.doesNotMatch(discovery, /ADOPTION_SPECIES_FILTERS\.map/);
    assert.doesNotMatch(discovery, /chipRow:/);
    assert.match(discovery, /borderColor: 'rgba\(255,255,255,0\.92\)'/);
  });
});

describe('avatar del refugio', () => {
  it('13. refugio con avatar → muestra avatar', () => {
    assert.match(cardSrc, /card\.shelterAvatar/);
    assert.match(cardSrc, /styles\.shelterAvatar/);
    assert.match(action('adoptionFeed'), /pr\.avatar_url AS shelter_avatar/);
    assert.match(action('adoptionFeed'), /shelterAvatar: r\.shelter_avatar/);
  });

  it('14. refugio sin avatar → fallback', () => {
    assert.match(cardSrc, /userFallbackAvatar/);
    assert.match(cardSrc, /card\.shelterAvatar \|\| userFallbackAvatar/);
  });

  it('15. username sigue sin @', () => {
    assert.match(cardSrc, /card\.shelterUsername \|\| card\.shelterName/);
    assert.doesNotMatch(cardSrc, /@\{shelter/);
    assert.doesNotMatch(cardSrc, /`@\$\{shelter/);
    assert.doesNotMatch(cardSrc, /@\$\{card\.shelterUsername\}/);
  });

  it('16. tocar identidad mantiene navegación correcta', () => {
    assert.match(discovery, /onOpenShelter=\{\(\) => openShelter\(item\)\}/);
    assert.match(discovery, /navigate\('PublicProfile', \{ username: card\.shelterUsername \}\)/);
    assert.match(discovery, /navigate\('PublicProfile', \{ profileId: card\.shelterProfileId \}\)/);
    assert.match(cardSrc, /onPress=\{onOpenShelter\}/);
    assert.match(cardSrc, /styles\.shelterRow/);
  });
});

describe('contacto de solicitudes de adopción', () => {
  it('17. crear refugio WhatsApp solo → válido', () => {
    const parsed = parseProtectorAdoptionContact('protector', '+54 9 387 555 1234', '');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.whatsapp, '+5493875551234');
      assert.equal(parsed.phone, null);
    }
  });

  it('18. teléfono solo → válido', () => {
    const parsed = parseProtectorAdoptionContact('protector', '', '3875551234');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.whatsapp, null);
      assert.equal(parsed.phone, '+5493875551234');
    }
  });

  it('19. ambos → válido', () => {
    const parsed = parseProtectorAdoptionContact('protector', '+5493871112222', '+5493873334444');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.ok(parsed.whatsapp);
      assert.ok(parsed.phone);
    }
  });

  it('20. ninguno → rechazado', () => {
    const parsed = parseProtectorAdoptionContact('protector', '', '');
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, ADOPTION_CONTACT_REQUIRED);
  });

  it('21. empresa normal no queda afectada indebidamente', () => {
    const parsed = parseProtectorAdoptionContact('business', '', '');
    assert.deepEqual(parsed, { ok: true, whatsapp: null, phone: null });
    assert.match(createSheet, /type === 'protector'/);
    assert.match(createSheet, /SOLICITUDES DE ADOPCIÓN/);
    assert.doesNotMatch(createSheet, /type === 'business'[\s\S]{0,80}SOLICITUDES DE ADOPCIÓN/);
    const create = action('createProfile');
    assert.match(create, /parseProtectorAdoptionContact\(type, body\.adoptionWhatsapp, body\.adoptionPhone\)/);
  });

  it('22. Página legacy sin contacto carga', () => {
    const pub = action('publicProfile');
    assert.doesNotMatch(pub, /ADOPTION_CONTACT_REQUIRED/);
    assert.match(pub, /includeAdoptionContact: viewerId === pr\.account_id/);
    assert.match(migration, /ALTER TABLE profiles ADD COLUMN adoption_whatsapp TEXT/);
    assert.match(migration, /ALTER TABLE profiles ADD COLUMN adoption_phone TEXT/);
    assert.match(migration, /LOCAL ONLY/);
  });

  it('23. editar refugio legacy exige contacto al guardar', () => {
    const existing = parseProtectorAdoptionContact('protector', null, null);
    assert.equal(existing.ok, false);
    assert.match(editPage, /parseProtectorAdoptionContact\(profileType, adoptionWhatsapp, adoptionPhone\)/);
    assert.match(editPage, /ADOPTION_CONTACT_REQUIRED/);
    assert.match(editPage, /SOLICITUDES DE ADOPCIÓN/);
    const update = action('updatePublicProfile');
    assert.match(update, /parseProtectorAdoptionContact/);
    assert.match(update, /owned\[0\]\.adoption_whatsapp/);
    assert.match(update, /owned\[0\]\.adoption_phone/);
  });

  it('24. servidor también valida', () => {
    const create = action('createProfile');
    const update = action('updatePublicProfile');
    assert.match(create, /if \(!contact\.ok\) return json\(\{ error: contact\.error \|\| ADOPTION_CONTACT_REQUIRED \}, 400\)/);
    assert.match(update, /if \(!contact\.ok\) return json\(\{ error: contact\.error \}, 400\)/);
    assert.match(createSheet, /parseProtectorAdoptionContact/);
    assert.match(editPage, /parseProtectorAdoptionContact/);
  });
});

describe('Quiero adoptar', () => {
  const wa = '+5493875551234';
  const tel = '+5493879990000';

  it('25. WhatsApp solo → WhatsApp', () => {
    const actionOpen = resolveAdoptionOpenAction({
      expectedShelterProfileId: 'prf-apan',
      shelterProfileId: 'prf-apan',
      whatsapp: wa,
      phone: null,
      petName: 'Good',
      petHandleOrId: 'good.pet',
    });
    assert.equal(actionOpen.kind, 'whatsapp');
    if (actionOpen.kind === 'whatsapp') {
      assert.match(actionOpen.url, /^https:\/\/wa\.me\/5493875551234\?text=/);
    }
  });

  it('26. teléfono solo → tel:', () => {
    const actionOpen = resolveAdoptionOpenAction({
      expectedShelterProfileId: 'prf-apan',
      shelterProfileId: 'prf-apan',
      whatsapp: null,
      phone: tel,
      petName: 'Luna',
    });
    assert.equal(actionOpen.kind, 'tel');
    if (actionOpen.kind === 'tel') assert.equal(actionOpen.url, `tel:${tel}`);
  });

  it('27. ambos → WhatsApp', () => {
    const actionOpen = resolveAdoptionOpenAction({
      expectedShelterProfileId: 'prf-apan',
      shelterProfileId: 'prf-apan',
      whatsapp: wa,
      phone: tel,
      petName: 'Good',
    });
    assert.equal(actionOpen.kind, 'whatsapp');
  });

  it('28. ninguno → mensaje humano', () => {
    const actionOpen = resolveAdoptionOpenAction({
      expectedShelterProfileId: 'prf-apan',
      shelterProfileId: 'prf-apan',
      whatsapp: null,
      phone: null,
      petName: 'Good',
    });
    assert.deepEqual(actionOpen, { kind: 'none', message: ADOPTION_CONTACT_MISSING });
    assert.match(cardSrc, /Este refugio todavía no agregó un medio de contacto/);
  });

  it('29. WhatsApp usa número correcto del refugio', () => {
    const url = buildWhatsAppUrl(wa, 'hola');
    assert.equal(url, `https://wa.me/5493875551234?text=${encodeURIComponent('hola')}`);
    assert.match(cardSrc, /db\.adoptionContact\(petId\)/);
    assert.match(action('adoptionContact'), /FROM profiles WHERE id = \? AND type = 'protector'/);
    assert.match(action('adoptionContact'), /pets\[0\]\.profile_id/);
  });

  it('30. teléfono usa número correcto', () => {
    assert.equal(buildTelUrl(tel), 'tel:+5493879990000');
    assert.equal(buildTelUrl('3879990000'), 'tel:+5493879990000');
  });

  it('31. mensaje usa pet.name', () => {
    const msg = adoptionInquiryMessage('Good', 'good.pet');
    assert.match(msg, /Hola, vi a Good en Animaldex/);
    assert.doesNotMatch(msg, /good\.pet y/);
    assert.match(msg, /https:\/\/animaldex-web\.pages\.dev\/good\.pet/);
    assert.match(cardSrc, /petName: res\.petName \|\| card\.name/);
    assert.equal(adoptCtaLabel('macho'), 'Quiero adoptarlo');
    assert.equal(adoptCtaLabel('hembra'), 'Quiero adoptarla');
    assert.equal(adoptCtaLabel('otro'), 'Quiero adoptar');
  });

  it('32. no usa contacto de otra Página', () => {
    const leaked = resolveAdoptionOpenAction({
      expectedShelterProfileId: 'prf-apan',
      shelterProfileId: 'prf-otro',
      whatsapp: wa,
      phone: tel,
      petName: 'Good',
    });
    assert.equal(leaked.kind, 'none');
    assert.match(action('adoptionContact'), /WHERE id = \? OR LOWER\(username\) = LOWER\(\?\)/);
    assert.match(action('adoptionContact'), /profiles WHERE id = \? AND type = 'protector'/);
    assert.doesNotMatch(action('adoptionContact'), /body\.shelter/);
    assert.doesNotMatch(cardSrc, /card\.adoptionWhatsapp/);
  });

  it('33. malformed number no genera URI peligrosa', () => {
    assert.equal(buildWhatsAppUrl('javascript:alert(1)', 'x'), null);
    assert.equal(buildTelUrl('javascript:alert(1)'), null);
    assert.equal(buildWhatsAppUrl('https://evil.example', 'x'), null);
    assert.equal(buildTelUrl('tel:javascript:alert(1)'), null);
    const bad = parseProtectorAdoptionContact('protector', 'no-es-numero', '');
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error, ADOPTION_CONTACT_INVALID);
  });

  it('34. username .pet intacto', () => {
    assert.equal(isValidPetUsername('good.pet'), true);
    assert.match(adoptionInquiryMessage('Nina', 'nina.pet'), /\/nina\.pet/);
  });

  it('35. CreatePost ownership intacto', () => {
    assert.match(createPost, /createPost/);
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: 'u1',
        pet: { userId: 'u1', profileId: 'prf-apan', careStatus: 'en_adopcion' },
        author: { id: 'prf-apan', type: 'protector', accountId: 'u1' },
      }).ok,
      true
    );
  });

  it('36. CreateReel ownership intacto', () => {
    assert.match(createReel, /authorProfileId: activeProfileId/);
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: 'u1',
        pet: { userId: 'u1', profileId: 'prf-apan' },
        author: { id: 'prf-shop', type: 'business', accountId: 'u1' },
      }).ok,
      false
    );
  });

  it('privacidad: contacto no va a feed/search/APIs generales', () => {
    assert.doesNotMatch(action('feed'), /adoption_whatsapp|adoptionWhatsapp/);
    assert.doesNotMatch(action('search'), /adoption_whatsapp|adoptionWhatsapp/);
    assert.doesNotMatch(action('adoptionFeed'), /adoption_whatsapp|adoptionWhatsapp/);
    assert.doesNotMatch(action('petProfile'), /includeAdoptionContact/);
    assert.match(action('userProfile'), /profiles: profiles\.map\(profileRow\)/);
    assert.doesNotMatch(action('listProfiles'), /includeAdoptionContact/);
    assert.match(db, /action: 'adoptionContact'/);
    assert.doesNotMatch(worker, /console\.(log|info|debug|warn)\([^\n]*adoption_whatsapp/);
    assert.doesNotMatch(cardSrc, /console\.(log|info|debug)/);
  });

  it('WhatsApp usa wa.me web-safe y Linking.openURL', () => {
    assert.match(cardSrc, /Linking\.openURL\(action\.url\)/);
    assert.match(cardSrc, /resolveAdoptionOpenAction/);
    const url = buildWhatsAppUrl('+54 9 387 555 1234', 'hola');
    assert.match(String(url), /^https:\/\/wa\.me\//);
    assert.doesNotMatch(cardSrc, /whatsapp:\/\//);
  });
});
