import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PET_STATUS_RING_GAP, PET_STATUS_RING_MS, PET_STATUS_RING_WIDTH } from '../lib/petStatusRing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const userProfile = src('screens/UserProfileScreen.tsx');
const petProfile = src('screens/PetProfileScreen.tsx');
const publicProfile = src('screens/PublicProfileScreen.tsx');
const avatar = src('components/PetStatusAvatar.tsx');
const stories = src('screens/StoryViewerScreen.tsx');
const storiesTest = src('tests/stories.test.ts');
const feedCard = src('components/PostCard.tsx');
const alertCard = src('components/AlertCard.tsx');

describe('avatares principales +2 px', () => {
  it('personal 96 → 98', () => {
    assert.match(userProfile, /avatar: \{ width: 98, height: 98, borderRadius: 49/);
    assert.doesNotMatch(userProfile, /avatar: \{ width: 96, height: 96/);
  });

  it('mascota 96 → 98', () => {
    assert.match(petProfile, /size=\{98\}/);
    assert.doesNotMatch(petProfile, /size=\{96\}/);
  });

  it('Empresa y Bienestar 108 → 110', () => {
    assert.match(publicProfile, /width: 110,/);
    assert.match(publicProfile, /height: 110,/);
    assert.match(publicProfile, /borderRadius: 55,/);
    assert.doesNotMatch(publicProfile, /width: 108,/);
  });
});

describe('aro animado más visible, misma implementación', () => {
  it('grosor 3 → 4; duración y sistema intactos', () => {
    assert.equal(PET_STATUS_RING_WIDTH, 4);
    assert.equal(PET_STATUS_RING_GAP, 2);
    assert.equal(PET_STATUS_RING_MS, 4000);
    assert.match(avatar, /withRepeat/);
    assert.match(avatar, /withTiming\(360/);
    assert.match(avatar, /Easing\.linear/);
    assert.match(avatar, /LinearGradient/);
    assert.doesNotMatch(avatar, /setInterval/);
  });
});

describe('badges encima del aro', () => {
  it('overlay de iconos sale después del clip de la foto', () => {
    const photoWrap = avatar.indexOf('styles.photoWrap');
    const image = avatar.indexOf('<Image');
    const badgeLayer = avatar.indexOf('styles.badgeLayer');
    const children = avatar.indexOf('{children}');
    assert.ok(photoWrap > 0 && image > photoWrap && badgeLayer > image && children > badgeLayer);
    assert.match(avatar, /badgeLayer: \{[\s\S]*zIndex: 5,[\s\S]*elevation: 8/);
    assert.match(avatar, /overflow: 'visible'/);
    assert.match(avatar, /pointerEvents="box-none"/);
  });

  it('solo la foto recorta; species/camera no están dentro de photoWrap', () => {
    const wrapStart = avatar.indexOf('styles.photoWrap');
    const wrapEnd = avatar.indexOf('{children ?');
    const photoBlock = avatar.slice(wrapStart, wrapEnd);
    assert.match(avatar, /photoWrap: \{[\s\S]*overflow: 'hidden'/);
    assert.doesNotMatch(photoBlock, /\{children\}/);
    assert.match(petProfile, /styles\.speciesBadge/);
    assert.match(petProfile, /styles\.cameraBadge/);
  });

  it('no toca avatares chicos de feed/alertas ni Stories V8', () => {
    assert.match(feedCard, /width: 42,\s*height: 42/);
    assert.match(alertCard, /width: 40,\s*height: 40/);
    assert.match(stories, /stageShell/);
    assert.match(stories, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(storiesTest, /stageShell/);
  });
});
