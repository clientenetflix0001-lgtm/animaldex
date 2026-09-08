import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasPetPhoto, isLegacyPetPlaceholder, petPhotoUri } from '../lib/petAvatar.ts';
import { userFallbackAvatar } from '../lib/images.ts';
import { getPostDisplay } from '../lib/postDisplay.ts';
import { buildMyPetsGrid } from '../lib/myPetsGrid.ts';
import { colors } from '../lib/theme.ts';
import type { Post } from '../lib/data.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const images = src('lib/images.ts');
const petAvatarLib = src('lib/petAvatar.ts');
const petAvatarUi = src('components/PetAvatar.tsx');
const statusAvatar = src('components/PetStatusAvatar.tsx');
const petProfile = src('screens/PetProfileScreen.tsx');
const postCard = src('components/PostCard.tsx');
const postDetail = src('screens/PostDetailScreen.tsx');
const myPets = src('screens/MyPetsScreen.tsx');
const userProfile = src('screens/UserProfileScreen.tsx');
const publicProfile = src('screens/PublicProfileScreen.tsx');
const feedPages = src('components/FeedPagesRow.tsx');
const alertCard = src('components/AlertCard.tsx');
const reelCard = src('components/ReelCard.tsx');
const storyViewer = src('screens/StoryViewerScreen.tsx');
const storyCircle = src('components/StoryCircle.tsx');
const createPost = src('screens/CreatePostScreen.tsx');
const createReel = src('screens/CreateReelScreen.tsx');
const explore = src('screens/ExploreScreen.tsx');
const adoptionsRow = src('components/FeedAdoptionsRow.tsx');
const adoptionCard = src('components/AdoptionDiscoveryCard.tsx');
const protectorGrid = src('components/ProtectorPetGridItem.tsx');
const suggestions = src('components/SuggestionsPanel.tsx');
const addPet = src('screens/AddPetScreen.tsx');
const worker = src('worker/index.js');
const postDisplay = src('lib/postDisplay.ts');

function realPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    petId: 'pet-1',
    image: 'https://cdn.example/post.jpg',
    caption: 'hola',
    likes: 0,
    minutesAgo: 3,
    comments: [],
    real: true,
    petName: 'Luna',
    petEmoji: '🐶',
    petSpecies: 'perro',
    petAvatarUrl: null,
    username: 'sofia.pets',
    ...overrides,
  };
}

describe('foto real vs patita de UI', () => {
  it('mascota sin foto → no hay URI de foto', () => {
    assert.equal(hasPetPhoto(null), false);
    assert.equal(hasPetPhoto(''), false);
    assert.equal(hasPetPhoto('   '), false);
    assert.equal(petPhotoUri(null), null);
    assert.equal(petPhotoUri(undefined), null);
    assert.equal(getPostDisplay(realPost({ petAvatarUrl: null })).avatarUri, null);
    assert.equal(buildMyPetsGrid([{ id: 'old-1', avatarUrl: null }])[1].kind, 'pet');
    const tile = buildMyPetsGrid([{ id: 'old-1', avatarUrl: null }])[1];
    if (tile.kind === 'pet') assert.equal(tile.avatarUri, null);
  });

  it('mascota con foto → muestra la foto', () => {
    const url = 'https://imagedelivery.net/abc/pet/public';
    assert.equal(hasPetPhoto(url), true);
    assert.equal(petPhotoUri(url), url);
    assert.equal(getPostDisplay(realPost({ petAvatarUrl: url })).avatarUri, url);
    const tile = buildMyPetsGrid([{ id: 'p1', avatarUrl: url }])[1];
    if (tile.kind === 'pet') assert.equal(tile.avatarUri, url);
    assert.match(petAvatarUi, /<Image/);
    assert.match(petAvatarUi, /petPhotoUri\(uri\)/);
  });

  it('el placeholder Dicebear shapes ya no se usa', () => {
    const legacy = 'https://api.dicebear.com/9.x/shapes/png?seed=luna';
    assert.equal(isLegacyPetPlaceholder(legacy), true);
    assert.equal(hasPetPhoto(legacy), false);
    assert.equal(petPhotoUri(legacy), null);
    assert.doesNotMatch(images, /petFallbackAvatar/);
    assert.doesNotMatch(images, /9\.x\/shapes/);
    for (const file of [
      petProfile,
      postCard,
      postDetail,
      myPets,
      userProfile,
      createPost,
      createReel,
      explore,
      adoptionsRow,
      adoptionCard,
      protectorGrid,
      suggestions,
      postDisplay,
    ]) {
      assert.doesNotMatch(file, /petFallbackAvatar/);
      assert.doesNotMatch(file, /dicebear\.com\/9\.x\/shapes/);
    }
  });

  it('persona sin foto → mantiene fallback humano actual', () => {
    assert.match(userFallbackAvatar('sofia'), /dicebear\.com\/9\.x\/initials/);
    assert.match(userFallbackAvatar('sofia'), /backgroundColor=FF6B4A/);
    assert.match(userProfile, /userFallbackAvatar\(displayUsername/);
    assert.match(alertCard, /userFallbackAvatar\(alert\.username/);
    assert.match(reelCard, /userFallbackAvatar\(handle/);
    assert.doesNotMatch(userProfile, /<PetAvatar/);
    assert.doesNotMatch(alertCard, /<PetAvatar/);
  });

  it('Página sin foto → mantiene fallback actual', () => {
    assert.match(publicProfile, /userFallbackAvatar/);
    assert.match(feedPages, /page\.avatarUrl \|\| userFallbackAvatar/);
    assert.doesNotMatch(feedPages, /<PetAvatar/);
    assert.doesNotMatch(publicProfile, /<PetAvatar/);
  });

  it('aro de mascota sigue funcionando', () => {
    assert.match(statusAvatar, /withRepeat/);
    assert.match(statusAvatar, /withTiming\(360/);
    assert.match(statusAvatar, /LinearGradient/);
    assert.match(statusAvatar, /ringStyle/);
    assert.match(statusAvatar, /<PetAvatar/);
    assert.doesNotMatch(statusAvatar, /setInterval/);
  });

  it('badge especie/cámara sigue encima', () => {
    const photoWrap = statusAvatar.indexOf('styles.photoWrap');
    const paw = statusAvatar.indexOf('<PetAvatar');
    const badgeLayer = statusAvatar.indexOf('styles.badgeLayer');
    const children = statusAvatar.indexOf('{children}');
    assert.ok(photoWrap > 0 && paw > photoWrap && badgeLayer > paw && children > badgeLayer);
    assert.match(statusAvatar, /zIndex: 5/);
    assert.match(statusAvatar, /elevation: 8/);
    assert.match(petProfile, /styles\.speciesBadge/);
    assert.match(petProfile, /styles\.cameraBadge/);
    const wrapStart = statusAvatar.indexOf('styles.photoWrap');
    const wrapEnd = statusAvatar.indexOf('{children ?');
    assert.doesNotMatch(statusAvatar.slice(wrapStart, wrapEnd), /\{children\}/);
  });

  it('PetProfile y PostCard usan la misma regla', () => {
    assert.match(petAvatarLib, /export function hasPetPhoto/);
    assert.match(petAvatarLib, /export function petPhotoUri/);
    assert.match(postDisplay, /petPhotoUri\(post\.petAvatarUrl\)/);
    assert.match(petProfile, /petPhotoUri\(realPet\?\.avatarUrl\)/);
    assert.match(petProfile, /<PetStatusAvatar/);
    assert.match(postCard, /<PetAvatar uri=\{disp\.avatarUri\}/);
    assert.match(postDetail, /<PetAvatar uri=\{disp\.avatarUri\}/);
    assert.match(petAvatarUi, /name=\{PET_AVATAR_PAW_ICON\}/);
    assert.match(petAvatarUi, /colors\.primarysoft/);
    assert.match(petAvatarUi, /colors\.primary/);
    assert.equal(colors.primary, '#FF6B4A');
    assert.equal(colors.primarysoft, '#FFE8E1');
  });

  it('no aplica la patita a uploads, schema ni createPet', () => {
    assert.doesNotMatch(worker, /petFallbackAvatar/);
    assert.doesNotMatch(worker, /dicebear\.com\/9\.x\/shapes/);
    assert.doesNotMatch(addPet, /<PetAvatar/);
    assert.match(addPet, /Agregar foto/);
    assert.doesNotMatch(storyCircle, /<PetAvatar/);
    assert.match(storyViewer, /author\?\.kind === 'pet'/);
    assert.match(storyViewer, /<PetAvatar uri=\{author\.avatarUrl\}/);
    assert.match(storyViewer, /userFallbackAvatar/);
  });
});
