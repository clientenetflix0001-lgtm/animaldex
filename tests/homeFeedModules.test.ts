import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FEED_COMPOSITION_POLICY,
  composeFeedPage,
  feedItemTypes,
  keysAreStable,
} from '../lib/feedComposition.ts';
import {
  HOME_ALERTS_VISIBLE_MAX,
  HOME_MODULE_TITLES,
  HOME_PAGES_VISIBLE_MIN,
  homeFeedHasHeaderStoryRail,
  homeFeedHasStoriesForYouModule,
  homePagesMeetVisibleMinimum,
  storiesForYouItems,
  visibleHomePageRecommendations,
} from '../lib/homeFeedModules.ts';
import {
  classifyHomeModuleGesture,
  parentFeedPagerShouldScroll,
  resolveHomeModuleInteraction,
  shouldFireHomeModulePress,
} from '../lib/homeModuleGestures.ts';
import { alertWithinRadiusKm, boundingBox, haversineKm } from '../lib/feedGeo.ts';
import { LAST_LOCATION_POLICY, parseLastLocation } from '../lib/lastLocation.ts';
import type { Post } from '../lib/data.ts';
import type { ApiAlert, ApiStoryRailItem } from '../lib/db.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const feed = read('screens/FeedScreen.tsx');
const rail = read('components/StoryRail.tsx');
const alertsRow = read('components/FeedAlertsRow.tsx');
const alertCard = read('components/AlertCard.tsx');
const pages = read('components/FeedPagesRow.tsx');
const adoptions = read('components/FeedAdoptionsRow.tsx');
const reels = read('components/FeedReelsRow.tsx');
const list = read('components/HomeHorizontalList.tsx');
const swiper = read('screens/FeedReelsSwiper.tsx');
const storyViewer = read('screens/StoryViewerScreen.tsx');
const lastSync = read('lib/lastLocationSync.ts');
const share = read('lib/share.ts');
const petTransfer = read('lib/petTransfer.ts');
const publicWeb = read('lib/publicWeb.ts');
const headerQr = read('lib/headerQr.ts');
const composition = read('lib/feedComposition.ts');
const worker = read('worker/index.js');

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

function story(id: string, kind: ApiStoryRailItem['kind'] = 'breed'): ApiStoryRailItem {
  return {
    kind,
    id,
    label: id,
    hasStory: true,
    hasUnseen: true,
    breedKey: id,
    breedSpecies: 'perro',
  };
}

function page(id: string) {
  return { id, name: id, username: id, avatarUrl: null, type: 'protector' as const, typeLabel: 'Bienestar Animal' };
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
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
  };
}

describe('HOME FEED VISUAL MODULES', () => {
  it('Story Rail superior existe y está antes del contenido del feed', () => {
    assert.equal(homeFeedHasHeaderStoryRail(feed), true);
    const headerAt = feed.indexOf('const listHeader');
    const listAt = feed.indexOf('ListHeaderComponent={listHeader}');
    const switcherAt = feed.lastIndexOf('<ProfileSwitcher');
    const feedListAt = feed.lastIndexOf('{feedList}');
    assert.ok(headerAt > 0 && listAt > headerAt);
    assert.ok(switcherAt > 0 && feedListAt > switcherAt);
    assert.match(feed, /<StoryRail seedItems=\{storyRailItems\}/);
    assert.doesNotMatch(feed, /<StoriesBar/);
  });

  it('Story Rail superior NO fue reemplazado por Historias para ti', () => {
    assert.equal((feed.match(/<StoryRail/g) || []).length, 2);
    assert.match(feed, /ListHeaderComponent=\{listHeader\}/);
    assert.match(feed, /title=\{HOME_MODULE_TITLES\.storiesForYou\}/);
    assert.match(feed, /disableNetworkRefresh/);
    assert.doesNotMatch(feed.slice(feed.indexOf('const listHeader'), feed.indexOf('const listFooter')), /Historias para ti/);
  });

  it('Historias para ti existe como módulo independiente', () => {
    assert.equal(homeFeedHasStoriesForYouModule(feed), true);
    assert.equal(HOME_MODULE_TITLES.storiesForYou, 'Historias para ti');
    assert.deepEqual(
      storiesForYouItems([story('self', 'self'), story('luna', 'identity'), story('caniche', 'breed'), story('more', 'more')]).map((i) => i.kind),
      ['identity', 'breed']
    );
    const onlySelf = composeFeedPage({
      pageIndex: 0,
      posts: [post('p1', 3), post('p2', 2)],
      storyItems: [story('me', 'self')],
    });
    assert.equal(onlySelf.items.some((item) => item.kind === 'story_channels'), false);
    const withForYou = composeFeedPage({
      pageIndex: 0,
      posts: [post('p1', 3), post('p2', 2)],
      storyItems: [story('me', 'self'), story('caniche', 'breed')],
    });
    assert.equal(withForYou.items.some((item) => item.kind === 'story_channels'), true);
    assert.match(rail, /HomeHorizontalList/);
    assert.match(rail, /disableNetworkRefresh/);
  });

  it('Alertas Home usan presentación completa y Difundir', () => {
    assert.equal(HOME_MODULE_TITLES.alerts, '🚨 Alertas cerca de ti');
    assert.equal(HOME_ALERTS_VISIBLE_MAX, 1);
    assert.equal(FEED_COMPOSITION_POLICY.maxAlerts, 1);
    assert.match(alertsRow, /HOME_ALERTS_VISIBLE_MAX/);
    assert.match(alertsRow, /rows\.slice\(0, HOME_ALERTS_VISIBLE_MAX\)/);
    assert.match(alertsRow, /AlertCard/);
    assert.match(alertsRow, /HOME_MODULE_TITLES\.alerts/);
    assert.doesNotMatch(alertsRow, /AlertChip/);
    assert.match(alertCard, /shareAlert\(alert\)/);
    assert.match(alertCard, /DIFUNDIR/);
    assert.match(share, /export async function shareAlert/);
    assert.match(alertsRow, /AlertDetail/);
  });

  it('páginas muestran al menos 3 candidatos cuando existen', () => {
    assert.equal(HOME_MODULE_TITLES.pages, 'Páginas que podrían interesarte');
    assert.equal(FEED_COMPOSITION_POLICY.minPageRecommendations, 3);
    assert.equal(FEED_COMPOSITION_POLICY.maxPageRecommendations, 8);
    const three = visibleHomePageRecommendations([page('a'), page('b'), page('c'), page('d')]);
    assert.equal(three.length >= HOME_PAGES_VISIBLE_MIN, true);
    assert.equal(homePagesMeetVisibleMinimum(three.length), true);
    const composed = composeFeedPage({
      pageIndex: 0,
      posts: [post('p1', 2)],
      pages: [page('a'), page('b'), page('c')],
    });
    const row = composed.items.find((item) => item.kind === 'page_recommendations');
    assert.ok(row && row.kind === 'page_recommendations');
    assert.equal(row.pages.length, 3);
    const two = visibleHomePageRecommendations([page('a'), page('b')]);
    assert.equal(two.length, 2);
    assert.match(pages, /HomeHorizontalList/);
    assert.match(pages, /FollowButton/);
    assert.match(worker, /loadHomePageRecommendations/);
    assert.match(worker, /LIMIT 24/);
  });

  it('cada módulo insertado tiene heading', () => {
    assert.match(rail, /HomeModuleTitle/);
    assert.match(alertsRow, /HOME_MODULE_TITLES\.alerts/);
    assert.match(pages, /HOME_MODULE_TITLES\.pages/);
    assert.match(adoptions, /HOME_MODULE_TITLES\.adoptions/);
    assert.match(reels, /HOME_MODULE_TITLES\.reels/);
    assert.equal(HOME_MODULE_TITLES.adoptions, 'Mascotas que buscan un hogar');
    assert.equal(HOME_MODULE_TITLES.reels, 'Reels para ti');
    assert.doesNotMatch(feed, /HomeModuleTitle>.*post|título de publicación/i);
  });

  it('adopciones mantienen navegación y Reels Home no autoplay', () => {
    assert.match(adoptions, /navigate\('PetProfile'/);
    assert.match(adoptions, /HomeHorizontalList/);
    assert.match(reels, /ReelViewer/);
    assert.match(reels, /HomeHorizontalList/);
    assert.doesNotMatch(reels, /autoPlay|isLooping|expo-video/);
  });

  it('HomeHorizontalList y gestos siguen intactos', () => {
    assert.match(list, /nestedScrollEnabled/);
    assert.match(list, /directionalLockEnabled/);
    assert.match(list, /claimHorizontal/);
    assert.match(swiper, /scrollEnabled=\{parentPagerEnabled\}/);
    assert.match(swiper, /pagingEnabled/);
    assert.equal(parentFeedPagerShouldScroll({ moduleOwnsHorizontal: false }), true);
    assert.equal(resolveHomeModuleInteraction({ module: 'reels', gesture: 'horizontal_swipe' }).openReelsTab, false);
    assert.equal(resolveHomeModuleInteraction({ module: 'page_recommendations', gesture: 'horizontal_swipe' }).openReelsTab, false);
    assert.equal(resolveHomeModuleInteraction({ module: 'story_channels', gesture: 'horizontal_swipe' }).openReelsTab, false);
    assert.equal(shouldFireHomeModulePress({ dx: 40, dy: 2 }), false);
    assert.equal(shouldFireHomeModulePress({ dx: 2, dy: 1 }), true);
    assert.equal(classifyHomeModuleGesture(8, 60), 'vertical_scroll');
    assert.equal((feed.match(/<FlatList[\s\n]/g) || []).length, 1);
  });

  it('keys estables, huecos vacíos no materializados, geo y last location intactos', () => {
    const out = composeFeedPage({
      pageIndex: 0,
      posts: [post('a', 3), post('b', 2)],
      alerts: [],
      pages: [],
      adoptions: [],
      reels: [],
    });
    assert.deepEqual(feedItemTypes(out.items), ['post', 'post']);
    assert.equal(keysAreStable(out.items), true);
    assert.equal(FEED_COMPOSITION_POLICY.alertRadiusKm, 10);
    assert.equal(LAST_LOCATION_POLICY.alertRadiusKm, 10);
    const box = boundingBox(-34.6, -58.4, 10);
    assert.ok(box.maxLat > box.minLat);
    assert.ok(haversineKm(-34.6, -58.4, -34.61, -58.41) < 10);
    assert.equal(alertWithinRadiusKm({ lat: -34.6, lon: -58.4 }, { lat: -34.6, lng: -58.4 }, 10), true);
    assert.match(lastSync, /AppState.addEventListener\('change'/);
    assert.doesNotMatch(lastSync, /startLocationUpdatesAsync|watchPositionAsync|BACKGROUND/);
    assert.ok(parseLastLocation({ lat: -34.6, lng: -58.4, locality: 'CABA', updatedAt: 9, source: 'gps' }));
    assert.match(storyViewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(petTransfer, /PET_TRANSFER_PAGE_REQUIRED/);
    assert.match(publicWeb, /PUBLIC_WEB_ORIGIN = 'https:\/\/animaldex\.com'/);
    assert.match(headerQr, /HEADER_QR_ROUTE/);
    assert.doesNotMatch(composition, /Math\.random|Date\.now\(\)/);
    assert.match(worker, /alertWithinRadiusKm/);
  });
});
