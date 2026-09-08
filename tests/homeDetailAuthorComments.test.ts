import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMMENT_ORDER_SQL,
  latestCommentCreatedAt,
  mergeCommentsNewestFirst,
  sortCommentsNewestFirst,
} from '../lib/commentsOrder.ts';
import {
  adoptionsAndReelsAreConsecutive,
  composeFeedPage,
  feedItemTypes,
  postIdsBetweenAdoptionsAndReels,
} from '../lib/feedComposition.ts';
import {
  postOwnerSubtitle,
  postSpeciesOwnerNoun,
  resolvePostHeader,
} from '../lib/postDisplay.ts';
import type { Post } from '../lib/data.ts';
import type { AdoptionCard } from '../lib/adoptionDiscovery.ts';
import type { ApiReel } from '../lib/db.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const postCard = read('components/PostCard.tsx');
const postDetail = read('screens/PostDetailScreen.tsx');
const worker = read('worker/index.js');
const store = read('lib/store.tsx');

function post(id: string, createdAt: number): Post {
  return {
    id,
    petId: `pet-${id}`,
    image: 'https://example.com/p.jpg',
    caption: id,
    likes: 0,
    minutesAgo: 0,
    createdAt,
    comments: [],
  };
}

function realPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    petId: '',
    image: 'https://example.com/p.jpg',
    caption: 'hola',
    likes: 0,
    minutesAgo: 2,
    comments: [],
    real: true,
    authorUserId: 'u-lucas',
    username: 'lucasfuentes',
    authorProfileId: 'pr-lucas',
    authorProfileType: 'personal',
    authorProfileUsername: 'lucasfuentes',
    authorProfileAvatar: 'https://cdn.example/lucas.jpg',
    ...overrides,
  };
}

const adoption: AdoptionCard = {
  id: 'pet:p1',
  source: 'protector_pet',
  petId: 'p1',
  petUsername: 'luna.pet',
  name: 'Luna',
  photo: null,
  birthDate: null,
  careStatus: 'en_adopcion',
  adoptionStartedAt: 1,
  size: null,
  sex: null,
  species: 'perro',
  shelterProfileId: 's1',
  shelterName: 'Huellas',
  shelterUsername: 'huellas',
  shelterAvatar: null,
  shelterLocation: null,
  shelterLocality: 'Córdoba',
  createdAt: 1,
};

const reel: ApiReel = {
  id: 'r1',
  userId: 'u',
  petId: null,
  caption: '',
  status: 'ready',
  durationMs: 1000,
  width: 1,
  height: 1,
  createdAt: 1,
  readyAt: 1,
  likeCount: 0,
  commentCount: 0,
  petName: null,
  petEmoji: null,
  petAvatar: null,
  petSpecies: null,
  petUsername: null,
  username: 'u',
  userName: 'U',
  playbackId: 'p',
  hlsUrl: null,
  thumbnailUrl: null,
};

describe('adopciones + post + reels', () => {
  it('1–3. adopciones, post intermedio y reels sin duplicar', () => {
    const posts = [post('a', 3), post('b', 2), post('c', 1)];
    const out = composeFeedPage({
      pageIndex: 0,
      posts,
      adoptions: [adoption],
      reels: [reel],
    });
    const kinds = feedItemTypes(out.items);
    assert.ok(kinds.includes('adoptions'));
    assert.ok(kinds.includes('reels'));
    assert.equal(adoptionsAndReelsAreConsecutive(out.items), false);
    const bridge = postIdsBetweenAdoptionsAndReels(out.items);
    assert.ok(bridge.length >= 1);
    const allIds = out.items.filter((i) => i.kind === 'post').map((i) => (i.kind === 'post' ? i.post.id : ''));
    assert.equal(allIds.length, new Set(allIds).size);
    assert.ok(bridge.every((id) => allIds.filter((x) => x === id).length === 1));
  });

  it('sin posts no inventa puente', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [],
      adoptions: [adoption],
      reels: [reel],
    });
    assert.deepEqual(feedItemTypes(out.items), ['adoptions', 'reels']);
    assert.equal(adoptionsAndReelsAreConsecutive(out.items), true);
    assert.deepEqual(postIdsBetweenAdoptionsAndReels(out.items), []);
  });
});

describe('comentarios newest-first', () => {
  it('4–6. orden, comentario nuevo arriba y empate estable', () => {
    const rows = [
      { id: 'c-old', createdAt: 10, text: 'viejo' },
      { id: 'c-new', createdAt: 30, text: 'nuevo' },
      { id: 'c-mid', createdAt: 20, text: 'medio' },
    ];
    assert.deepEqual(sortCommentsNewestFirst(rows).map((c) => c.id), ['c-new', 'c-mid', 'c-old']);
    const tied = sortCommentsNewestFirst([
      { id: 'c-a', createdAt: 50 },
      { id: 'c-b', createdAt: 50 },
    ]);
    assert.deepEqual(tied.map((c) => c.id), ['c-b', 'c-a']);
    const merged = mergeCommentsNewestFirst(rows, [{ id: 'c-fresh', createdAt: 40, text: 'yo' }]);
    assert.equal(merged[0].id, 'c-fresh');
    assert.equal(latestCommentCreatedAt(merged), 40);
    assert.match(worker, /WHERE c\.post_id = \? ORDER BY c\.created_at DESC, c\.id DESC LIMIT 200/);
    assert.match(worker, /created_at > \? ORDER BY c\.created_at DESC, c\.id DESC LIMIT 50/);
    assert.equal(COMMENT_ORDER_SQL, 'ORDER BY c.created_at DESC, c.id DESC');
    assert.match(postDetail, /mergeCommentsNewestFirst\(prev, \[optimistic\]\)/);
    assert.match(postDetail, /tempId/);
  });
});

describe('autor Feed == Detail', () => {
  it('7–9. mismo helper; mascota no sustituye autor; Página se conserva', () => {
    const personal = resolvePostHeader(realPost());
    assert.equal(personal.kind, 'personal');
    assert.equal(personal.title, 'lucasfuentes');
    assert.equal(personal.subtitle, null);
    assert.equal(personal.avatarUri, 'https://cdn.example/lucas.jpg');
    assert.equal(personal.open.mode, 'human');

    const fabricatedPet = resolvePostHeader(
      realPost({ petId: '', petName: undefined, petSpecies: undefined })
    );
    assert.equal(fabricatedPet.kind, 'personal');
    assert.equal(fabricatedPet.title, 'lucasfuentes');
    assert.notEqual(fabricatedPet.kind, 'pet');

    const page = resolvePostHeader(
      realPost({
        authorProfileType: 'protector',
        authorProfileUsername: 'apansalta',
        authorProfileAvatar: 'https://cdn.example/page.jpg',
        petId: 'nana',
        petName: 'Nana',
        petSpecies: 'perro',
      })
    );
    assert.equal(page.kind, 'page');
    assert.equal(page.title, 'apansalta');
    assert.equal(page.open.mode, 'page');

    assert.match(postCard, /resolvePostHeader\(post\)/);
    assert.match(postDetail, /resolvePostHeader\(post\)/);
    assert.match(store, /petId \? p\.petName \?\? 'Mascota'/);
    assert.doesNotMatch(store, /petSpecies \?\? 'perro'/);
    assert.doesNotMatch(postDetail, /disp\.petUsername \|\| disp\.petName/);
  });
});

describe('acciones Feed vs Detail', () => {
  it('10–12. detail auth oculta; guest y feed las muestran', () => {
    assert.match(postDetail, /guest \? actionsRow : null/);
    assert.match(postDetail, /if \(guest\) \{ requireLogin\(\); return; \}/);
    assert.match(postCard, /<View style=\{styles\.actions\}>/);
    assert.doesNotMatch(postCard, /guest \? actionsRow/);
  });
});

describe('copy especie otro', () => {
  it('13–15. otro → mascota de; especies normales; mismo helper', () => {
    assert.equal(postSpeciesOwnerNoun('otro'), 'mascota');
    assert.equal(postOwnerSubtitle('otro', 'lucasfuentes'), 'mascota de (lucasfuentes)');
    assert.equal(postOwnerSubtitle('perro', 'lucasfuentes'), 'perro de (lucasfuentes)');
    assert.equal(postOwnerSubtitle('gato', 'sofia'), 'gato de (sofia)');
    const pet = resolvePostHeader(
      realPost({
        authorProfileId: undefined,
        petId: 'nana',
        petName: 'Nana',
        petUsername: 'nana.pet',
        petSpecies: 'otro',
        petEmoji: '',
      })
    );
    assert.equal(pet.kind, 'pet');
    assert.equal(pet.subtitle, 'mascota de (lucasfuentes)');
    const dog = resolvePostHeader(
      realPost({
        authorProfileId: undefined,
        petId: 'rocky',
        petName: 'Rocky',
        petUsername: 'rocky.pet',
        petSpecies: 'perro',
        petEmoji: '',
      })
    );
    assert.equal(dog.subtitle, 'perro de (lucasfuentes)');
    assert.match(postCard, /header\.subtitle/);
    assert.match(postDetail, /headerIdentity\.subtitle/);
    assert.match(postCard, /resolvePostHeader/);
    assert.match(postDetail, /resolvePostHeader/);
  });
});
