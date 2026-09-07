import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOME_HORIZONTAL_MODULES,
  classifyHomeModuleGesture,
  homeFeedScrollContract,
  homeModuleGestureOwner,
  homeVerticalListShouldScroll,
  parentFeedPagerShouldScroll,
  resolveHomeModuleInteraction,
  shouldFireHomeModulePress,
  type HomeHorizontalModule,
} from '../lib/homeModuleGestures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const feed = read('screens/FeedScreen.tsx');
const swiper = read('screens/FeedReelsSwiper.tsx');
const nav = read('lib/feedReelsNav.ts');
const storyViewer = read('screens/StoryViewerScreen.tsx');
const list = read('components/HomeHorizontalList.tsx');
const pages = read('components/FeedPagesRow.tsx');
const adoptions = read('components/FeedAdoptionsRow.tsx');
const stories = read('components/StoryRail.tsx');
const reels = read('components/FeedReelsRow.tsx');
const alerts = read('components/FeedAlertsRow.tsx');
const circle = read('components/StoryCircle.tsx');

const MODULE_FILES: Record<Exclude<HomeHorizontalModule, never>, string> = {
  page_recommendations: pages,
  adoptions,
  story_channels: stories,
  reels,
  alerts,
};

describe('HOME MODULE HORIZONTAL GESTURES', () => {
  it('swipe horizontal en Páginas no abre Reels', () => {
    const out = resolveHomeModuleInteraction({ module: 'page_recommendations', gesture: 'horizontal_swipe' });
    assert.equal(out.openReelsTab, false);
    assert.equal(out.changeTab, false);
    assert.equal(out.navigateLaterally, false);
    assert.equal(out.scrollCarousel, true);
    assert.equal(out.fireItemPress, false);
    assert.equal(out.openItem, 'none');
    assert.match(pages, /HomeHorizontalList/);
    assert.match(pages, /HomeModulePressable/);
  });

  it('swipe horizontal en Adopciones no abre Reels', () => {
    const out = resolveHomeModuleInteraction({ module: 'adoptions', gesture: 'horizontal_swipe' });
    assert.equal(out.openReelsTab, false);
    assert.equal(out.changeTab, false);
    assert.equal(out.scrollCarousel, true);
    assert.equal(out.openItem, 'none');
    assert.match(adoptions, /HomeHorizontalList/);
    assert.match(adoptions, /HomeModulePressable/);
    assert.match(adoptions, /PetProfile/);
  });

  it('swipe horizontal en Stories module no abre Reels', () => {
    const out = resolveHomeModuleInteraction({ module: 'story_channels', gesture: 'horizontal_swipe' });
    assert.equal(out.openReelsTab, false);
    assert.equal(out.changeTab, false);
    assert.equal(out.scrollCarousel, true);
    assert.equal(out.fireItemPress, false);
    assert.match(stories, /HomeHorizontalList/);
    assert.match(circle, /HomeModulePressable/);
    assert.doesNotMatch(stories, /StoryViewerScreen/);
  });

  it('swipe horizontal en Reels module no navega por sí solo', () => {
    const out = resolveHomeModuleInteraction({ module: 'reels', gesture: 'horizontal_swipe' });
    assert.equal(out.openReelsTab, false);
    assert.equal(out.changeTab, false);
    assert.equal(out.navigateLaterally, false);
    assert.equal(out.fireItemPress, false);
    assert.equal(out.openItem, 'none');
    assert.equal(out.scrollCarousel, true);
    assert.match(reels, /HomeHorizontalList/);
    assert.match(reels, /preventPressOnSwipe/);
    assert.match(reels, /ReelViewer/);
    assert.doesNotMatch(reels, /setPage|tabFromFeedPage|navigate\('Reels'/);
  });

  it('tap en item sí navega', () => {
    assert.equal(resolveHomeModuleInteraction({ module: 'page_recommendations', gesture: 'tap' }).openItem, 'PublicProfile');
    assert.equal(resolveHomeModuleInteraction({ module: 'adoptions', gesture: 'tap' }).openItem, 'PetProfile');
    assert.equal(resolveHomeModuleInteraction({ module: 'story_channels', gesture: 'tap' }).openItem, 'StoryViewer');
    assert.equal(resolveHomeModuleInteraction({ module: 'reels', gesture: 'tap' }).openItem, 'ReelViewer');
    assert.equal(resolveHomeModuleInteraction({ module: 'alerts', gesture: 'tap' }).openItem, 'AlertDetail');
    assert.equal(resolveHomeModuleInteraction({ module: 'reels', gesture: 'tap' }).openReelsTab, false);
    assert.equal(shouldFireHomeModulePress({ dx: 3, dy: 2 }), true);
    assert.match(pages, /navigate\('PublicProfile'/);
    assert.match(adoptions, /navigate\('PetProfile'/);
    assert.match(stories, /navigate\('StoryViewer'/);
    assert.match(reels, /navigate\('ReelViewer'/);
  });

  it('swipe no dispara onPress', () => {
    assert.equal(shouldFireHomeModulePress({ dx: 48, dy: 4 }), false);
    assert.equal(shouldFireHomeModulePress({ dx: -40, dy: 6 }), false);
    assert.equal(shouldFireHomeModulePress({ dx: 8, dy: 2, recentHorizontalSwipe: true }), false);
    assert.equal(classifyHomeModuleGesture(48, 4), 'horizontal_swipe');
    assert.equal(resolveHomeModuleInteraction({ module: 'page_recommendations', gesture: 'horizontal_swipe' }).fireItemPress, false);
    assert.match(list, /shouldFireHomeModulePress/);
    assert.match(list, /HomeModulePressable/);
  });

  it('scroll vertical del Home sigue funcionando', () => {
    const vertical = resolveHomeModuleInteraction({ module: 'reels', gesture: 'vertical_scroll' });
    assert.equal(vertical.scrollHome, true);
    assert.equal(vertical.scrollCarousel, false);
    assert.equal(vertical.openReelsTab, false);
    assert.equal(homeVerticalListShouldScroll({ moduleOwnsHorizontal: true }), true);
    assert.equal(homeVerticalListShouldScroll({ moduleOwnsHorizontal: false }), true);
    assert.equal(homeFeedScrollContract().mainVerticalFlatListCount, 1);
    assert.match(feed, /<FlatList[\s\n]/);
    assert.equal((feed.match(/<FlatList[\s\n]/g) || []).length, 1);
  });

  it('no conflicto horizontal/vertical', () => {
    assert.equal(homeModuleGestureOwner('horizontal_swipe'), 'carousel');
    assert.equal(homeModuleGestureOwner('vertical_scroll'), 'home');
    assert.equal(classifyHomeModuleGesture(60, 8), 'horizontal_swipe');
    assert.equal(classifyHomeModuleGesture(8, 60), 'vertical_scroll');
    assert.equal(classifyHomeModuleGesture(4, 3), 'tap');
    const horizontal = resolveHomeModuleInteraction({ module: 'alerts', gesture: 'horizontal_swipe' });
    const vertical = resolveHomeModuleInteraction({ module: 'alerts', gesture: 'vertical_scroll' });
    assert.equal(horizontal.scrollCarousel, true);
    assert.equal(horizontal.scrollHome, false);
    assert.equal(vertical.scrollHome, true);
    assert.equal(vertical.scrollCarousel, false);
    assert.match(list, /directionalLockEnabled/);
    assert.match(list, /nestedScrollEnabled/);
    assert.match(list, /claimHorizontal/);
  });

  it('una sola FlatList vertical principal', () => {
    const contract = homeFeedScrollContract();
    assert.equal(contract.mainVerticalFlatListCount, 1);
    assert.equal(contract.modulesHorizontal, true);
    assert.equal(contract.parentPagerUnchangedOutsideModules, true);
    assert.equal((feed.match(/<FlatList[\s\n]/g) || []).length, 1);
    assert.match(feed, /<StoryRail/);
    assert.match(feed, /FeedPagesRow|FeedAdoptionsRow|FeedReelsRow/);
    for (const module of HOME_HORIZONTAL_MODULES) {
      if (module === 'alerts') {
        assert.match(MODULE_FILES[module], /AlertCard/);
        assert.match(MODULE_FILES[module], /HomeModuleTitle/);
        continue;
      }
      assert.match(MODULE_FILES[module], /HomeHorizontalList/);
    }
  });

  it('el pager global de Reels no cambia fuera de los módulos', () => {
    assert.equal(parentFeedPagerShouldScroll({ moduleOwnsHorizontal: false }), true);
    assert.equal(parentFeedPagerShouldScroll({ moduleOwnsHorizontal: true }), false);
    assert.match(swiper, /pagingEnabled/);
    assert.match(swiper, /scrollEnabled=\{parentPagerEnabled\}/);
    assert.match(swiper, /HomeModuleGestureLockProvider/);
    assert.match(swiper, /setPage/);
    assert.match(swiper, /<FeedScreen/);
    assert.match(swiper, /<ReelsScreen/);
    assert.match(nav, /page === 1 \? 'Reels' : 'Inicio'/);
    assert.match(storyViewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.doesNotMatch(nav, /homeModule|claimHorizontal/);
  });
});
