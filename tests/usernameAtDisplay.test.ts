import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { petCardHandle } from '../lib/myPetsGrid.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const postCard = readFileSync(join(root, 'components/PostCard.tsx'), 'utf8');
const postDetail = readFileSync(join(root, 'screens/PostDetailScreen.tsx'), 'utf8');
const reelCard = readFileSync(join(root, 'components/ReelCard.tsx'), 'utf8');
const reels = readFileSync(join(root, 'screens/ReelsScreen.tsx'), 'utf8');
const alertCard = readFileSync(join(root, 'components/AlertCard.tsx'), 'utf8');
const alertDetail = readFileSync(join(root, 'screens/AlertDetailScreen.tsx'), 'utf8');
const explore = readFileSync(join(root, 'screens/ExploreScreen.tsx'), 'utf8');
const listingCard = readFileSync(join(root, 'components/ListingCard.tsx'), 'utf8');
const listingDetail = readFileSync(join(root, 'screens/ListingDetailScreen.tsx'), 'utf8');
const suggestions = readFileSync(join(root, 'components/SuggestionsPanel.tsx'), 'utf8');
const userProfile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const publicProfile = readFileSync(join(root, 'screens/PublicProfileScreen.tsx'), 'utf8');
const addPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
const sellerShop = readFileSync(join(root, 'screens/SellerShopScreen.tsx'), 'utf8');
const switcher = readFileSync(join(root, 'features/profiles/ProfileSwitcher.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'components/Sidebar.tsx'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');
const storyComments = readFileSync(join(root, 'components/StoryCommentsSheet.tsx'), 'utf8');

describe('contenido: username sin @ visual', () => {
  it('1. comentario de post muestra username, no @ ni display_name', () => {
    assert.match(postDetail, /name: c\.username/);
    assert.doesNotMatch(postDetail, /name: c\.userName/);
    assert.match(postDetail, /\{item\.name\}/);
    assert.doesNotMatch(postDetail, /@\{item\.name\}/);
    assert.doesNotMatch(postDetail, /@\{item\.username\}/);
  });

  it('2. no hay replies con autor; otras listas de comentarios sin @', () => {
    assert.doesNotMatch(postDetail, /replyTo|parent_id|inReply/);
    assert.doesNotMatch(alertDetail, /replyTo|parent_id|inReply/);
    assert.match(alertDetail, /name: c\.username/);
    assert.match(listingDetail, /name: c\.username/);
    assert.doesNotMatch(alertDetail, /@\{item\.name\}/);
    assert.doesNotMatch(listingDetail, /@\{item\.name\}/);
    assert.match(reels, /\{item\.username\}/);
    assert.doesNotMatch(reels, /@\{item\.username\}/);
    assert.match(storyComments, /\{item\.username\}/);
    assert.doesNotMatch(storyComments, /@\{item\.username\}/);
  });

  it('3–5. switcher, sidebar y selector de identidad sin @', () => {
    assert.match(switcher, /\{p\.username\}/);
    assert.doesNotMatch(switcher, /@\{p\.username\}/);
    assert.match(sidebar, /\{user\?\.username/);
    assert.doesNotMatch(sidebar, /@\{user\?\.username/);
    assert.match(suggestions, /\{user\?\.username/);
    assert.doesNotMatch(suggestions, /@\{user\?\.username/);
    assert.match(switcher, /Seleccionar perfil o página/);
  });

  it('Feed, Reels, Alertas, Explore, Mercado sin @', () => {
    assert.match(postCard, /\$\{profileHandle\}/);
    assert.match(postCard, /de \(\{disp\.username\}\)/);
    assert.doesNotMatch(postCard, /`@\$\{profileHandle\}`/);
    assert.doesNotMatch(postCard, /de \(@\{disp\.username\}\)/);
    assert.doesNotMatch(reelCard, /styles\.name\}>@\{/);
    assert.match(alertCard, /Publicado por \{alert\.username\}/);
    assert.match(explore, /\{item\.user\.username\} · Usuario/);
    assert.match(listingCard, /\{listing\.username \?\? 'usuario'\}/);
    assert.match(sellerShop, /\{seller\.username\}/);
    assert.doesNotMatch(sellerShop, /@\{seller\.username\}/);
    assert.match(sellerShop, /\{item\.username\}/);
    assert.doesNotMatch(sellerShop, /\{item\.userName\}/);
    assert.doesNotMatch(petProfile, /@\{shelter\.username\}/);
    assert.doesNotMatch(petProfile, /@\{ownerUsername\}/);
  });

  it('9. .pet intacto', () => {
    assert.equal(petCardHandle({ id: 'p1', username: 'nina.pet' }), 'nina.pet');
    assert.equal(petCardHandle({ id: 'p1', username: '@nina.pet' }), 'nina.pet');
    assert.notEqual(petCardHandle({ id: 'p1', username: 'nina.pet' }), 'nina');
    assert.doesNotMatch(postCard, /stripPetSuffix/);
    assert.doesNotMatch(postDetail, /stripPetSuffix/);
  });

  it('10. mención dentro del texto intacta', () => {
    assert.match(postDetail, /\{item\.text\}/);
    assert.doesNotMatch(postDetail, /item\.text\.replace/);
    assert.doesNotMatch(alertDetail, /item\.text\.replace/);
    assert.doesNotMatch(reels, /item\.text\.replace/);
    assert.match(reels, /\{item\.text\}/);
  });
});

describe('perfiles: se conserva @ de identidad', () => {
  it('6. perfil personal → @lucasfuentes', () => {
    assert.match(userProfile, /@\{displayUsername\}/);
  });

  it('7. perfil mascota → @nina.pet', () => {
    assert.match(petProfile, /@\{petHandle\}/);
  });

  it('8. Página → @apansalta / @empresa', () => {
    assert.match(publicProfile, /@\{profile\.username\}/);
  });

  it('Create/Edit Pet conserva @ del control', () => {
    assert.match(addPet, /handleAt/);
    assert.match(addPet, /@\{lockedUsername \|\| username\}/);
    assert.match(addPet, /Probá @\$\{suggestion\}/);
  });

  it('OG / WhatsApp no se toca', () => {
    assert.match(pages, / · @\$\{publicHandle\}/);
    assert.match(pages, /🐾 @\$\{pr\.username\}/);
  });
});
