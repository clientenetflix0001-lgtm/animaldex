import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CREATE_POST_SCREEN_OPTIONS, CREATE_POST_SUCCESS_TAB } from '../lib/createPostPublish.ts';
import { getActivePostBackgrounds } from '../lib/postBackgrounds.ts';
import { colors, FEED_POST_GAP, spacing } from '../lib/theme.ts';
import {
  LEGACY_IONICON_PAW_NODES,
  PAW_LAYOUTS,
  PAW_OVERLAY_DECORATIVE_NODES,
  PAWS_PER_LAYOUT,
  pawNativeViewsPerOverlay,
  pawOverlayCost,
} from '../lib/pawPrintLayout.ts';
import { shouldHideCrearTabBar } from '../lib/crearFlyerRoutes.ts';
import { createChooserOpensInCrearStack } from '../lib/createChooser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('auditoría Feed / Crear / GEO', () => {
  it('huellas: 1 Image reutilizable vs 6 nodos Ionicons, en todos los fondos', () => {
    const active = getActivePostBackgrounds();
    const cost = pawOverlayCost(active);
    assert.equal(PAWS_PER_LAYOUT, 5);
    for (const layout of PAW_LAYOUTS) assert.equal(layout.length, PAWS_PER_LAYOUT);
    assert.equal(cost.ioniconNodesPerCard, LEGACY_IONICON_PAW_NODES);
    assert.equal(cost.staticNodesPerCard, 1);
    assert.equal(cost.historicalCardsWithPaws, 1);
    assert.equal(cost.currentCardsWithPaws, active.length);
    assert.ok(active.length >= 12);
    assert.equal(pawNativeViewsPerOverlay(), PAW_OVERLAY_DECORATIVE_NODES);
    assert.ok(cost.ioniconNodesPerCard >= 6);
    assert.ok(cost.staticNodesPerCard * 6 <= cost.ioniconNodesPerCard);
    assert.equal(existsSync(join(root, 'assets/images/paw-print-overlay.png')), true);
    const card = read('components/PostBackgroundCard.tsx');
    const overlay = read('components/PawPrintOverlay.tsx');
    assert.match(card, /<PawPrintOverlay color=\{bg\.textColor\}/);
    assert.match(card, /export const PostBackgroundCard = memo\(/);
    assert.match(overlay, /export const PawPrintOverlay = memo\(/);
    assert.doesNotMatch(card, /backgroundId=\{bg\.id\}/);
    assert.doesNotMatch(card, /pattern === 'paws'/);
    assert.doesNotMatch(overlay, /Ionicons/);
    assert.match(overlay, /paw-print-overlay\.png/);
    assert.match(read('lib/feedMediaPerf.ts'), /pawOverlayRenders/);
  });

  it('FeedScreen no recarga al incorporar createdPosts y sigue siendo FlatList', () => {
    const feed = read('screens/FeedScreen.tsx');
    assert.match(feed, /from 'react-native'/);
    assert.match(feed, /<FlatList/);
    assert.doesNotMatch(feed, /FlashList/);
    const created = feed.slice(feed.indexOf('createdPosts.length === 0'));
    assert.match(created, /scrollToOffset\(\{ offset: 0, animated: true \}\)/);
    assert.doesNotMatch(created.slice(0, 700), /loadReal/);
    assert.doesNotMatch(created.slice(0, 700), /fetchHomeFeedBuckets/);
  });

  it('CreatePost vive en CrearStack y no aplica modal al Root Stack', () => {
    const app = read('App.tsx');
    const tabStack = read('lib/tabProfileStack.tsx');
    const rootNav = app.slice(app.indexOf('<Stack.Navigator>'), app.indexOf('// En Android, initialWindowMetrics'));
    assert.doesNotMatch(rootNav.slice(0, 80), /screenOptions=\{/);
    assert.equal(CREATE_POST_SCREEN_OPTIONS.animation, 'none');
    assert.equal('presentation' in CREATE_POST_SCREEN_OPTIONS, false);
    assert.equal(CREATE_POST_SUCCESS_TAB, 'Inicio');
    assert.equal(createChooserOpensInCrearStack('post'), true);
    assert.equal(shouldHideCrearTabBar('Crear', 'CreatePost'), true);
    assert.match(tabStack, /name="CreatePost"/);
    assert.match(tabStack, /CREATE_POST_SCREEN_OPTIONS/);
    assert.doesNotMatch(app, /name="CreatePost"/);
    const alertBlock = app.slice(app.indexOf('name="CreateAlert"'), app.indexOf('name="MyAlerts"'));
    assert.doesNotMatch(alertBlock, /presentation: 'modal'/);
    assert.doesNotMatch(alertBlock, /animation: 'none'/);
    assert.match(alertBlock, /title: 'Crear alerta'/);
    const listing = app.slice(app.indexOf('name="CreateListing"'), app.indexOf('name="MyListings"'));
    assert.doesNotMatch(listing, /presentation: 'modal'/);
    const story = app.slice(app.indexOf('name="CreateStory"'), app.indexOf('name="StoryViewer"'));
    assert.doesNotMatch(story, /presentation: 'modal'/);
    const reel = app.slice(app.indexOf('name="CreateReel"'), app.indexOf('name="CreateStory"'));
    assert.doesNotMatch(reel, /presentation: 'modal'/);
  });

  it('separación crema entre posts: una sola fuente de ~7dp', () => {
    const theme = read('lib/theme.ts');
    const postCard = read('components/PostCard.tsx');
    const feed = read('screens/FeedScreen.tsx');
    const cardBlock = postCard.slice(postCard.indexOf('card: {'), postCard.indexOf('header: {'));
    assert.equal(FEED_POST_GAP, 7);
    assert.ok(FEED_POST_GAP >= 6 && FEED_POST_GAP <= 8);
    assert.equal(colors.bg, '#FFF9F2');
    assert.ok(FEED_POST_GAP < spacing.xl);
    assert.match(theme, /export const FEED_POST_GAP = 7/);
    assert.match(cardBlock, /marginBottom: FEED_POST_GAP/);
    assert.doesNotMatch(cardBlock, /marginTop/);
    assert.doesNotMatch(cardBlock, /paddingVertical|paddingBottom|paddingTop/);
    assert.equal((cardBlock.match(/marginBottom/g) || []).length, 1);
    assert.doesNotMatch(feed, /ItemSeparatorComponent/);
    const listBlock = feed.slice(feed.indexOf('<FlatList'), feed.indexOf('/>', feed.indexOf('<FlatList')) + 2);
    assert.doesNotMatch(listBlock, /\bgap:/);
    assert.doesNotMatch(listBlock, /ItemSeparator/);
    assert.match(feed, /backgroundColor: colors\.bg/);
    const overlay = read('components/PawPrintOverlay.tsx');
    assert.equal((overlay.match(/<Image/g) || []).length, 1);
    assert.doesNotMatch(overlay, /Ionicons/);
  });

  it('el camino del Feed no llama GEOREF remoto', () => {
    const feed = read('screens/FeedScreen.tsx');
    const home = read('lib/homeFeed.ts');
    const sync = read('lib/lastLocationSync.ts');
    const locate = read('lib/placeLocate.ts');
    assert.doesNotMatch(feed, /geoResolveCoords/);
    assert.doesNotMatch(feed, /handleGeo|GEOREF_BASE|apis\.datos\.gob\.ar/);
    assert.doesNotMatch(home, /geoResolveCoords/);
    assert.doesNotMatch(home, /locateCurrentPlace/);
    assert.doesNotMatch(sync, /geoResolveCoords/);
    assert.match(sync, /no forma parte de este camino/);
    assert.doesNotMatch(locate, /geoResolveCoords/);
    assert.match(locate, /reverseGeocodeAsync/);
    assert.match(feed, /bindLastLocationForegroundSync/);
    assert.doesNotMatch(feed, /PlacePicker/);
  });
});
