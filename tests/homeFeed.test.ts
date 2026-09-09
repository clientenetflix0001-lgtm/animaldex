import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALERT_RADIUS_KM,
  alertWithinRadiusKm,
  boundingBox,
  haversineKm,
  isWithinRadiusKm,
  NEARBY_RADIUS_KM,
  pointInBoundingBox,
  postLocalityRelevant,
  postWithinRadiusKm,
} from '../lib/feedGeo.ts';
import {
  LAST_LOCATION_POLICY,
  locationIsStale,
  parseLastLocation,
  publicPayloadHasUserCoords,
  shouldWriteLastLocation,
} from '../lib/lastLocation.ts';
import { pickLocalityRelevantPostIds, pickTrendingPostIds, trendingScore } from '../lib/feedRanking.ts';
import {
  FEED_COMPOSITION_POLICY,
  appendFeedItems,
  adoptionsAndReelsAreConsecutive,
  composerModulesAreAdjacent,
  composeFeedPage,
  postsBetweenComposerModules,
  selectHomeModuleAlerts,
  feedItemKey,
  feedItemTypes,
  hasVisibleAdSlot,
  keysAreStable,
  postIdsBetweenAdoptionsAndReels,
  type FeedItem,
} from '../lib/feedComposition.ts';
import { prioritizeUserBreedStoryItems, uniqueBreedChannelsFromPets } from '../lib/stories.ts';
import type { Post } from '../lib/data.ts';
import type { ApiAlert, ApiReel, ApiStoryRailItem } from '../lib/db.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const feed = read('screens/FeedScreen.tsx');
const worker = read('worker/index.js');
const db = read('lib/db.ts');
const lastLoc = read('lib/lastLocation.ts');
const lastSync = read('lib/lastLocationSync.ts');
const composition = read('lib/feedComposition.ts');
const homeFeed = read('lib/homeFeed.ts');
const migration = read('migrations/012_user_last_location.sql');
const publicUser = read('lib/db.ts');
const storyViewer = read('screens/StoryViewerScreen.tsx');
const app = read('App.tsx');

function post(id: string, createdAt: number, likes = 0): Post {
  return {
    id,
    petId: `pet-${id}`,
    image: 'https://example.com/p.jpg',
    caption: id,
    likes,
    minutesAgo: 0,
    createdAt,
    comments: [],
  };
}

function alert(id: string): ApiAlert {
  return {
    id,
    userId: 'u',
    type: 'lost',
    status: 'active',
    petName: id,
    species: 'perro',
    breed: '',
    description: '',
    image: '',
    locality: 'Córdoba',
    province: 'Córdoba',
    country: 'AR',
    lat: null,
    lon: null,
    eventDate: null,
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    username: 'u',
    userName: 'U',
    userAvatar: null,
  };
}

function reel(id: string): ApiReel {
  return {
    id,
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
    thumbnailUrl: 'https://example.com/t.jpg',
  };
}

function story(id: string, kind: ApiStoryRailItem['kind'] = 'breed'): ApiStoryRailItem {
  return {
    kind,
    id,
    label: id,
    hasStory: true,
    hasUnseen: false,
    breedKey: id,
    breedSpecies: 'perro',
  };
}

describe('LOCATION', () => {
  it('1. última ubicación se guarda en users, no en historial', () => {
    assert.match(migration, /ALTER TABLE users ADD COLUMN last_lat REAL/);
    assert.match(migration, /last_lng/);
    assert.match(migration, /last_location_updated_at/);
    assert.match(migration, /last_locality/);
    assert.doesNotMatch(migration, /CREATE TABLE.*location_history|CREATE TABLE.*user_locations/);
    assert.match(worker, /UPDATE users SET last_lat = \?, last_lng = \?, last_locality = \?, last_location_updated_at = \? WHERE id = \?/);
    assert.match(worker, /action === 'updateLastLocation'/);
  });

  it('2. no historial de posiciones', () => {
    assert.doesNotMatch(worker, /INSERT INTO location_history/);
    assert.doesNotMatch(lastLoc, /history\.push|locations\s*=\s*\[/);
    assert.match(lastLoc, /Never a history of positions/);
  });

  it('3. stale location actualiza', () => {
    const prev = { lat: -34.6, lng: -58.4, locality: 'CABA', updatedAt: 1, source: 'gps' as const };
    assert.equal(locationIsStale(prev, 1 + LAST_LOCATION_POLICY.staleMs, LAST_LOCATION_POLICY.staleMs), true);
    assert.equal(shouldWriteLastLocation(prev, { lat: -34.6, lng: -58.4, locality: 'CABA' }, 1 + LAST_LOCATION_POLICY.staleMs), true);
  });

  it('4. ubicación fresca no genera WRITE innecesario', () => {
    const now = 10_000_000;
    const prev = { lat: -34.6, lng: -58.4, locality: 'CABA', updatedAt: now - 60_000, source: 'gps' as const };
    assert.equal(shouldWriteLastLocation(prev, { lat: -34.601, lng: -58.401, locality: 'CABA' }, now), false);
  });

  it('5. sin permiso funciona fallback', () => {
    assert.match(lastSync, /detectCurrentLocality/);
    assert.match(lastSync, /source: gps \? 'gps' : locality \? 'profile' : 'cache'/);
    assert.match(feed, /bindLastLocationForegroundSync/);
    assert.doesNotMatch(feed, /Obteniendo ubicación/);
    assert.doesNotMatch(feed, /estás en|estas en|cambiar ubicación/i);
  });

  it('6. no se expone ubicación públicamente', () => {
    assert.match(worker, /function publicUser\(u\)/);
    const start = worker.indexOf('function publicUser(u)');
    const block = worker.slice(start, start + 400);
    assert.doesNotMatch(block, /last_lat|last_lng|lastLat|lastLng/);
    assert.match(worker, /SELECT id, username, name, avatar_url, bio, location, verified_phone, created_at FROM users WHERE id = \?/);
    assert.doesNotMatch(block, /last_location/);
    assert.equal(publicPayloadHasUserCoords({ id: 'u', location: 'Córdoba' }), false);
    assert.equal(publicPayloadHasUserCoords({ last_lat: -34, last_lng: -58 }), true);
    assert.match(worker, /function stripAlertCoords/);
  });
});

describe('POST LOCALITY vs ALERT 10KM', () => {
  const origin = { lat: -34.6037, lng: -58.3816 };
  const inside = { lat: -34.6037 + 5 / 111, lng: -58.3816 };
  const outside = { lat: -34.6037 + 20 / 111, lng: -58.3816 };

  it('1. post misma localidad → relevante localmente', () => {
    assert.equal(postLocalityRelevant('Córdoba', null, 'Córdoba'), true);
    assert.equal(postLocalityRelevant(null, 'Córdoba', 'córdoba'), true);
    assert.deepEqual(
      pickLocalityRelevantPostIds(
        [{ id: 'local', createdAt: 1, authorLocality: 'Córdoba' }, { id: 'other', createdAt: 1, authorLocality: 'Rosario' }],
        'Córdoba'
      ),
      ['local']
    );
  });

  it('2. post otra localidad → no se considera local por distancia', () => {
    assert.equal(postLocalityRelevant('Rosario', null, 'Córdoba'), false);
    assert.equal(postWithinRadiusKm({ lat: null, lng: null }, origin), false);
  });

  it('3. post no afirma 10km sin coords', () => {
    assert.equal(postWithinRadiusKm({}, origin), false);
    assert.equal(postLocalityRelevant('Córdoba', null, 'Córdoba'), true);
    assert.doesNotMatch(read('lib/feedRanking.ts'), /within 10|ALERT_RADIUS|haversineKm/);
    assert.doesNotMatch(read('screens/FeedScreen.tsx'), /A 10 km|Cerca a 10 km|menos de 10 km/);
    assert.doesNotMatch(read('lib/feedComposition.ts'), /nearbyRadiusKm/);
    assert.match(read('lib/feedGeo.ts'), /postLocalityRelevant/);
    assert.match(read('lib/feedGeo.ts'), /alertWithinRadiusKm/);
  });

  it('4–5. alerta dentro de 10 km sí; fuera no', () => {
    assert.equal(ALERT_RADIUS_KM, 10);
    assert.equal(NEARBY_RADIUS_KM, 10);
    assert.equal(FEED_COMPOSITION_POLICY.alertRadiusKm, 10);
    assert.equal(alertWithinRadiusKm(inside, origin), true);
    assert.equal(alertWithinRadiusKm(outside, origin), false);
  });

  it('6. Haversine solo se aplica donde hay coords', () => {
    assert.equal(alertWithinRadiusKm({ lat: null, lon: null }, origin), false);
    assert.equal(postWithinRadiusKm({ lat: inside.lat, lng: inside.lng }, origin), true);
    assert.equal(postWithinRadiusKm({ lat: null, lng: null }, origin), false);
    assert.ok(haversineKm(origin.lat, origin.lng, inside.lat, inside.lng) < 10);
    assert.ok(haversineKm(origin.lat, origin.lng, outside.lat, outside.lng) > 10);
    assert.equal(isWithinRadiusKm(origin, inside, 10), true);
    assert.equal(isWithinRadiusKm(origin, outside, 10), false);
    const box = boundingBox(origin.lat, origin.lng, 10);
    assert.equal(pointInBoundingBox(inside.lat, inside.lng, box), true);
    assert.equal(pointInBoundingBox(outside.lat, outside.lng, box), false);
  });
});

describe('CONTRACT INTACT', () => {
  it('7. composición del feed intacta', () => {
    assert.deepEqual([...FEED_COMPOSITION_POLICY.firstPageSequence], [
      'locality_relevant_post',
      'trending_post',
      'story_channels',
      'post',
      'post',
      'alerts',
      'post',
      'post',
      'page_recommendations',
      'post',
      'post',
      'adoptions',
      'post',
      'post',
      'reels',
      'remaining_posts',
    ]);
    assert.match(worker, /nearbyPostIds,/);
    assert.match(homeFeed, /nearbyPostIds/);
  });

  it('8–11. dedupe, Stories, Reels y performance intactos', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [post('same', 2), post('other', 1)],
      localityRelevantPostIds: ['same'],
      trendingPostIds: ['same'],
    });
    assert.deepEqual(
      out.items.filter((i) => i.kind === 'post').map((i) => (i.kind === 'post' ? i.post.id : '')),
      ['same', 'other']
    );
    assert.match(feed, /<StoryRail/);
    assert.match(feed, /FeedReelsRow/);
    assert.match(feed, /keyExtractor = useCallback\(\(item: FeedItem\) => item\.key/);
    assert.match(feed, /const renderItem = useCallback/);
    assert.equal((feed.match(/<FlatList[\s\n]/g) || []).length, 1);
  });
});

describe('COMPOSITION', () => {
  const stories = [story('caniche'), story('labrador')];
  const alerts = [alert('a1'), alert('a2'), alert('a3')];
  const pages = [{ id: 'pg1', name: 'Huellas', username: 'huellas', avatarUrl: null, type: 'protector' as const, typeLabel: 'Bienestar Animal' }];
  const adoptions = [{
    id: 'pet:p1',
    source: 'protector_pet' as const,
    petId: 'p1',
    petUsername: 'luna.pet',
    name: 'Luna',
    photo: null,
    birthDate: null,
    careStatus: 'en_adopcion' as const,
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
  }];
  const reels = [reel('r1'), reel('r2')];
  const posts = [
    post('near', 1000, 1),
    post('trend', 900, 80),
    post('p3', 800),
    post('p4', 700),
    post('p5', 600),
    post('p6', 500),
    post('p7', 400),
    post('p8', 300),
    post('p9', 200),
    post('p10', 100),
  ];

  it('11–19. secuencia de producto sin huecos ni ads reales', () => {
    const first = composeFeedPage({
      pageIndex: 0,
      posts,
      localityRelevantPostIds: ['near'],
      trendingPostIds: ['trend'],
      storyItems: stories,
      alerts,
      pages,
      adoptions,
      reels,
    });
    assert.deepEqual(feedItemTypes(first.items), [
      'post',
      'post',
      'story_channels',
      'post',
      'post',
      'alerts',
      'post',
      'post',
      'page_recommendations',
      'post',
      'post',
      'adoptions',
      'post',
      'post',
      'reels',
    ]);
    assert.equal(adoptionsAndReelsAreConsecutive(first.items), false);
    assert.equal(composerModulesAreAdjacent(first.items), false);
    assert.ok(postsBetweenComposerModules(first.items).every((n) => n >= 2));
    assert.deepEqual(postIdsBetweenAdoptionsAndReels(first.items), ['p9', 'p10']);
    const firstPostIds = first.items.filter((i) => i.kind === 'post').map((i) => (i.kind === 'post' ? i.post.id : ''));
    assert.equal(firstPostIds.length, new Set(firstPostIds).size);
    assert.equal(first.items[0].kind === 'post' && first.items[0].bucket, 'locality');
    assert.equal(first.items[1].kind === 'post' && first.items[1].bucket, 'trending');
    const alertMod = first.items.find((item) => item.kind === 'alerts');
    assert.equal(alertMod && alertMod.kind === 'alerts' && alertMod.alerts.length, 1);
    assert.equal(alertMod && alertMod.kind === 'alerts' && alertMod.alerts[0].id, 'a1');
    assert.equal(FEED_COMPOSITION_POLICY.maxAlerts, 1);
    assert.equal(hasVisibleAdSlot(first.items), false);
    assert.equal(FEED_COMPOSITION_POLICY.ads.enabled, false);

    const noAlerts = composeFeedPage({
      pageIndex: 0,
      posts,
      localityRelevantPostIds: ['near'],
      trendingPostIds: ['trend'],
      storyItems: stories,
      alerts: [],
      pages,
      adoptions,
      reels,
    });
    assert.equal(noAlerts.items.some((item) => item.kind === 'alerts'), false);
    assert.ok(noAlerts.items.some((item) => item.kind === 'page_recommendations'));
    assert.ok(!feedItemTypes(noAlerts.items).includes('alerts'));
  });

  it('20. ausencia de módulo no deja hueco', () => {
    const emptyMods = composeFeedPage({
      pageIndex: 0,
      posts: [post('a', 3), post('b', 2), post('c', 1)],
    });
    assert.deepEqual(feedItemTypes(emptyMods.items), ['post', 'post', 'post']);
  });
});

describe('DEDUP', () => {
  it('21. trending+locality no duplica', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [post('same', 2), post('other', 1)],
      localityRelevantPostIds: ['same'],
      trendingPostIds: ['same'],
    });
    const ids = out.items.filter((i) => i.kind === 'post').map((i) => i.kind === 'post' ? i.post.id : '');
    assert.deepEqual(ids, ['same', 'other']);
  });

  it('22b. una alerta por módulo y no repite si hay alternativas', () => {
    const pool = [alert('a1'), alert('a2'), alert('a3')];
    const enoughPosts = [post('p1', 3), post('p2', 2), post('p3', 1)];
    assert.deepEqual(selectHomeModuleAlerts(pool).map((a) => a.id), ['a1']);
    assert.deepEqual(selectHomeModuleAlerts(pool, ['a1']).map((a) => a.id), ['a2']);
    const first = composeFeedPage({
      pageIndex: 0,
      posts: enoughPosts,
      alerts: pool,
    });
    const second = composeFeedPage({
      pageIndex: 0,
      posts: enoughPosts,
      alerts: pool,
      usedAlertIds: first.usedAlertIds,
    });
    const firstAlert = first.items.find((i) => i.kind === 'alerts');
    const secondAlert = second.items.find((i) => i.kind === 'alerts');
    assert.equal(firstAlert && firstAlert.kind === 'alerts' && firstAlert.alerts[0].id, 'a1');
    assert.equal(secondAlert && secondAlert.kind === 'alerts' && secondAlert.alerts[0].id, 'a2');
    assert.doesNotMatch(composition, /Math\.random/);
  });

  it('22–23. alert y reel no duplican', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [post('p', 1)],
      alerts: [alert('a1'), alert('a1')],
      reels: [reel('r1'), reel('r1')],
    });
    const alerts = out.items.find((i) => i.kind === 'alerts');
    const reels = out.items.find((i) => i.kind === 'reels');
    assert.equal(alerts && alerts.kind === 'alerts' && alerts.alerts.length, 1);
    assert.equal(reels && reels.kind === 'reels' && reels.reels.length, 1);
  });
});

describe('PERFORMANCE', () => {
  it('24–26. stable keys, no Math.random / Date.now', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [post('p1', 2), post('p2', 1)],
      alerts: [alert('a1')],
    });
    assert.equal(keysAreStable(out.items), true);
    assert.equal(out.items[0].key, feedItemKey('post', 'p1'));
    assert.doesNotMatch(composition, /key:.*Math\.random|key:.*Date\.now/);
    assert.doesNotMatch(feed, /keyExtractor=\{.*Math\.random|keyExtractor=\{.*Date\.now/);
    assert.match(feed, /keyExtractor = useCallback\(\(item: FeedItem\) => item\.key/);
  });

  it('27–28. renderItem estable y módulos memo', () => {
    assert.match(feed, /const renderItem = useCallback/);
    assert.match(read('components/FeedAlertsRow.tsx'), /memo\(FeedAlertsRowInner\)/);
    assert.match(read('components/FeedPagesRow.tsx'), /memo\(FeedPagesRowInner\)/);
    assert.match(read('components/FeedAdoptionsRow.tsx'), /memo\(FeedAdoptionsRowInner\)/);
    assert.match(read('components/FeedReelsRow.tsx'), /memo\(FeedReelsRowInner\)/);
  });

  it('29. pagination append, no reorder', () => {
    const page1 = composeFeedPage({ pageIndex: 0, posts: [post('a', 3), post('b', 2)] });
    const page2 = composeFeedPage({ pageIndex: 1, posts: [post('c', 1)], usedPostIds: page1.usedPostIds });
    const merged = appendFeedItems(page1.items, page2.items);
    assert.deepEqual(
      merged.filter((i) => i.kind === 'post').map((i) => (i.kind === 'post' ? i.post.id : '')),
      ['a', 'b', 'c']
    );
    assert.equal(page2.items.some((i) => i.kind !== 'post'), false);
    assert.match(feed, /mergeHomeFeedPages/);
    assert.match(homeFeed, /db\.feed/);
  });

  it('30. refresh sí reconstruye', () => {
    assert.match(feed, /usedPostIdsRef\.current = new Set\(\)/);
    assert.match(feed, /firstPage: reset/);
    assert.match(feed, /onRefresh/);
  });
});

describe('TRENDING', () => {
  it('score decae con la edad y no eterniza likes viejos', () => {
    const now = 1_000_000_000;
    const fresh = trendingScore({ id: 'a', createdAt: now - 2 * 3600_000, likeCount: 20, commentCount: 4 }, now);
    const old = trendingScore({ id: 'b', createdAt: now - 20 * 24 * 3600_000, likeCount: 400, commentCount: 40 }, now);
    assert.ok(fresh > old);
    assert.equal(old, 0);
    const ids = pickTrendingPostIds(
      [
        { id: 'old', createdAt: now - 20 * 24 * 3600_000, likeCount: 999 },
        { id: 'hot', createdAt: now - 3600_000, likeCount: 12, commentCount: 6 },
      ],
      now
    );
    assert.deepEqual(ids, ['hot']);
  });
});

describe('STORIES BREED', () => {
  it('prioriza canales de las mascotas del usuario y no carga todas las razas', () => {
    const channels = uniqueBreedChannelsFromPets([
      { species: 'perro', breed: 'Caniche' },
      { species: 'perro', breed: 'Labrador' },
    ]);
    const items = prioritizeUserBreedStoryItems(
      [
        story('self', 'self'),
        { ...story('otra'), breedKey: 'otra', breedSpecies: 'perro' },
        { ...story('caniche'), breedKey: channels[0].breedKey, breedSpecies: 'perro' },
      ],
      channels
    );
    const breedIds = items.filter((i) => i.kind === 'breed').map((i) => i.id);
    assert.equal(breedIds[0], 'caniche');
    assert.match(read('worker/stories.js'), /uniqueBreedChannelsFromPets\(personal\)/);
    assert.doesNotMatch(feed, /StoryViewerScreen/);
  });
});

describe('REGRESSIONS', () => {
  it('31–42. Feed, likes, comments, share, Stories V8, Alertas, Adoption, Reels, Profiles, transfers, QR, dominio', () => {
    assert.match(feed, /<FlatList/);
    assert.match(feed, /<PostCard/);
    assert.match(feed, /onToggleLike=\{toggleLike\}/);
    assert.match(feed, /onOpenPost=\{openPost\}/);
    assert.match(feed, /db\.counts/);
    assert.match(read('lib/share.ts'), /postShareUrl|Share\.share/);
    assert.match(storyViewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(app, /name="Alertas"/);
    assert.match(app, /name="AdoptionDiscovery"/);
    assert.match(app, /name="ReelViewer"/);
    assert.match(app, /name="PetProfile"/);
    assert.match(app, /name="QRScanner"/);
    assert.match(read('lib/petTransfer.ts'), /PET_TRANSFER_PAGE_REQUIRED/);
    assert.match(read('lib/publicWeb.ts'), /PUBLIC_WEB_ORIGIN = 'https:\/\/animaldex\.com'/);
    assert.match(read('components/FeedReelsRow.tsx'), /ReelGridTile/);
    assert.doesNotMatch(read('components/FeedReelsRow.tsx'), /autoPlay|isLooping|expo-video/);
    assert.match(read('components/FeedAdoptionsRow.tsx'), /PetProfile/);
    assert.doesNotMatch(read('components/FeedAdoptionsRow.tsx'), /Quiero adoptar|WantToAdoptButton/);
    assert.match(db, /action: 'homeFeed'/);
    assert.match(db, /action: 'updateLastLocation'/);
  });
});

describe('PRIVACY / NO GPS BACKGROUND', () => {
  it('foreground only, una sola lista, ads preparados', () => {
    assert.match(lastSync, /AppState.addEventListener\('change'/);
    assert.doesNotMatch(lastSync, /startLocationUpdatesAsync|watchPositionAsync|BACKGROUND/);
    assert.match(feed, /<FlatList[\s\n]/);
    assert.equal((feed.match(/<FlatList[\s\n]/g) || []).length, 1);
    assert.match(composition, /kind: 'ad_slot'/);
    assert.equal(FEED_COMPOSITION_POLICY.ads.enabled, false);
    assert.match(worker, /action === 'homeFeed'/);
    assert.match(parseLastLocation({ lat: -34.6, lng: -58.4, locality: 'CABA', updatedAt: 9, source: 'gps' })?.locality || '', /CABA/);
  });
});
