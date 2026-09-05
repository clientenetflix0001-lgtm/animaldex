import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADOPTION_PURPLE } from '../lib/adoptionDiscovery.ts';
import { colors } from '../lib/theme.ts';
import {
  PET_STATUS_RING_GAP,
  PET_STATUS_RING_GREEN,
  PET_STATUS_RING_MS,
  PET_STATUS_RING_PURPLE,
  PET_STATUS_RING_RED,
  PET_STATUS_RING_WIDTH,
  petStatusRingColors,
  petStatusRingOuterSize,
  petStatusRingTone,
} from '../lib/petStatusRing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const avatar = readFileSync(join(root, 'components/PetStatusAvatar.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const adoptBtn = readFileSync(join(root, 'components/WantToAdoptButton.tsx'), 'utf8');
const pkg = readFileSync(join(root, 'package.json'), 'utf8');
const pkgLock = readFileSync(join(root, 'package-lock.json'), 'utf8');

describe('aro de estado de mascota', () => {
  it('1. En casa → green', () => {
    assert.equal(petStatusRingTone('en_casa'), 'green');
    assert.equal(petStatusRingColors('en_casa'), PET_STATUS_RING_GREEN);
    assert.equal(PET_STATUS_RING_GREEN[1], '#39D37A');
  });

  it('2. En recuperación → green', () => {
    assert.equal(petStatusRingTone('en_recuperacion'), 'green');
    assert.equal(petStatusRingColors('en_recuperacion'), PET_STATUS_RING_GREEN);
  });

  it('3. Perdido → red', () => {
    assert.equal(petStatusRingTone('perdido'), 'red');
    assert.equal(petStatusRingColors('perdido'), PET_STATUS_RING_RED);
    assert.equal(PET_STATUS_RING_RED[0], colors.heart);
    assert.ok(PET_STATUS_RING_RED.includes(colors.primary));
  });

  it('4. En adopción → purple', () => {
    assert.equal(petStatusRingTone('en_adopcion'), 'purple');
    assert.equal(petStatusRingColors('en_adopcion'), PET_STATUS_RING_PURPLE);
  });

  it('5. adopción reutiliza el violeta de Quiero adoptar', () => {
    assert.equal(PET_STATUS_RING_PURPLE[0], ADOPTION_PURPLE);
    assert.match(adoptBtn, /backgroundColor: ADOPTION_PURPLE/);
    assert.equal(ADOPTION_PURPLE, '#A94CF4');
  });

  it('6. null / desconocido → sin aro', () => {
    assert.equal(petStatusRingTone(null), null);
    assert.equal(petStatusRingTone(undefined), null);
    assert.equal(petStatusRingTone('adoptado'), null);
    assert.equal(petStatusRingTone('otro'), null);
    assert.equal(petStatusRingColors(null), null);
  });

  it('7. la foto no gira', () => {
    const imageBlock = avatar.slice(avatar.indexOf('<Image'), avatar.indexOf('/>', avatar.indexOf('<Image')) + 2);
    assert.doesNotMatch(imageBlock, /rotate/);
    assert.doesNotMatch(imageBlock, /transform/);
  });

  it('8. solamente el ring tiene transformación animada', () => {
    assert.match(avatar, /ringStyle/);
    assert.match(avatar, /transform: \[\{ rotate: `/);
    assert.match(avatar, /Animated\.View/);
    assert.doesNotMatch(avatar, /setInterval/);
    assert.doesNotMatch(avatar, /setState/);
    const rotateCount = avatar.split('rotate:').length - 1;
    assert.equal(rotateCount, 1);
  });

  it('9. PetProfile mantiene avatar base 98', () => {
    assert.match(petProfile, /<PetStatusAvatar/);
    assert.match(petProfile, /size=\{98\}/);
    assert.doesNotMatch(petProfile, /Math\.min\(288/);
    assert.equal(petStatusRingOuterSize(98), 98 + 2 * (PET_STATUS_RING_WIDTH + PET_STATUS_RING_GAP));
    assert.ok(petStatusRingOuterSize(98) < 140);
  });

  it('10. username .pet intacto', () => {
    assert.match(petProfile, /@\{petHandle\}/);
    assert.match(petProfile, /const petHandle = realPet\?\.username/);
  });

  it('11. chips intactos', () => {
    assert.match(petProfile, /statusText/);
    assert.match(petProfile, /speciesLabel/);
    assert.match(petProfile, /\{breed\}/);
    assert.match(petProfile, /\{age\}/);
    assert.match(petProfile, /sizeText/);
    assert.match(petProfile, /neuteredText/);
    assert.match(petProfile, /careStatusLabel/);
  });

  it('12. stats y posts intactos', () => {
    assert.match(petProfile, /label="Posts"/);
    assert.match(petProfile, /label="Seguidores"/);
    assert.match(petProfile, /<FollowButton/);
    assert.match(petProfile, /accessibilityLabel="Publicaciones"/);
  });

  it('13–14. sin fetch por frame ni setInterval', () => {
    assert.doesNotMatch(avatar, /setInterval/);
    assert.doesNotMatch(avatar, /requestAnimationFrame/);
    assert.doesNotMatch(avatar, /db\./);
    assert.match(avatar, /withRepeat/);
    assert.match(avatar, /withTiming/);
    assert.match(avatar, /react-native-reanimated/);
    assert.equal(PET_STATUS_RING_MS, 4000);
    assert.equal(PET_STATUS_RING_WIDTH, 4);
    assert.equal(PET_STATUS_RING_GAP, 2);
  });

  it('15. no hay dependencia nativa nueva', () => {
    assert.match(pkg, /"react-native-reanimated"/);
    assert.match(pkg, /"expo-linear-gradient"/);
    assert.doesNotMatch(pkg, /lottie|skia|reanimated-color|moti/);
    assert.match(pkgLock, /react-native-reanimated-4\.5\.3/);
  });
});
