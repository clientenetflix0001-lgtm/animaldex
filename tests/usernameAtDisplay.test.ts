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

describe('contenido: username sin @ visual', () => {
  it('Feed / PostCard muestra username crudo, no display_name', () => {
    assert.match(postCard, /\$\{profileHandle\}/);
    assert.match(postCard, /\$\{disp\.petUsername \|\| disp\.petName\.toLowerCase\(\)\}/);
    assert.match(postCard, /de \(\{disp\.username\}\)/);
    assert.doesNotMatch(postCard, /`@\$\{profileHandle\}`/);
    assert.doesNotMatch(postCard, /`@\$\{disp\.petUsername/);
    assert.doesNotMatch(postCard, /de \(@\{disp\.username\}\)/);
  });

  it('PostDetail header igual que el feed', () => {
    assert.match(postDetail, /\{disp\.petUsername \|\| disp\.petName\.toLowerCase\(\)\}/);
    assert.match(postDetail, /de \(\{disp\.username\}\)/);
    assert.doesNotMatch(postDetail, /@\{disp\.petUsername/);
    assert.doesNotMatch(postDetail, /de \(@\{disp\.username\}\)/);
  });

  it('Reels y comentarios de Reels sin @', () => {
    assert.match(reelCard, /\{handle \|\| 'usuario'\}/);
    assert.match(reelCard, /\{reel\.petEmoji \|\| '🐾'\} \{petHandle\}/);
    assert.doesNotMatch(reelCard, /styles\.name\}>@\{/);
    assert.doesNotMatch(reelCard, /\} @\{petHandle\}/);
    assert.match(reels, /\{item\.username\}/);
    assert.doesNotMatch(reels, /@\{item\.username\}/);
  });

  it('Alertas y listados sin @', () => {
    assert.match(alertCard, /Publicado por \{alert\.username\}/);
    assert.match(alertDetail, /Publicado por \{alert\.username\}/);
    assert.doesNotMatch(alertCard, /Publicado por @\{alert\.username\}/);
    assert.doesNotMatch(alertDetail, /Publicado por @\{alert\.username\}/);
    assert.match(explore, /\{item\.user\.username\} · Usuario/);
    assert.match(explore, /\$\{item\.pet\.username\} · /);
    assert.doesNotMatch(explore, /@\{item\.user\.username\}/);
    assert.doesNotMatch(explore, /`@\$\{item\.pet\.username\}/);
    assert.match(listingCard, /\{listing\.username \?\? 'usuario'\}/);
    assert.match(listingDetail, /\{listing\.username \?\? 'usuario'\}/);
    assert.doesNotMatch(listingCard, /@\{listing\.username/);
    assert.doesNotMatch(listingDetail, /@\{listing\.username/);
    assert.match(suggestions, /sub: p\.username \? `\$\{p\.username\}`/);
    assert.doesNotMatch(suggestions, /sub: p\.username \? `@\$\{p\.username\}`/);
  });

  it('nina.pet se conserva; no se recorta a nina', () => {
    assert.equal(petCardHandle({ id: 'p1', username: 'nina.pet' }), 'nina.pet');
    assert.equal(petCardHandle({ id: 'p1', username: '@nina.pet' }), 'nina.pet');
    assert.notEqual(petCardHandle({ id: 'p1', username: 'nina.pet' }), 'nina');
    assert.doesNotMatch(postCard, /stripPetSuffix/);
    assert.doesNotMatch(reelCard, /stripPetSuffix/);
  });
});

describe('perfiles: se conserva @ de identidad', () => {
  it('perfil personal, mascota, Página y create', () => {
    assert.match(userProfile, /@\{displayUsername\}/);
    assert.match(petProfile, /@\{petHandle\}/);
    assert.match(publicProfile, /@\{profile\.username\}/);
    assert.match(addPet, /@\{lockedUsername \|\| username\}/);
    assert.match(sellerShop, /@\{seller\.username\}/);
    assert.match(switcher, /@\{p\.username\}/);
    assert.match(sidebar, /@\{user\?\.username/);
    assert.match(suggestions, /@\{user\?\.username/);
  });

  it('OG / WhatsApp no se toca', () => {
    assert.match(pages, / · @\$\{publicHandle\}/);
    assert.match(pages, /🐾 @\$\{pr\.username\}/);
  });
});
