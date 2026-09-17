import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CREATE_POST_SCREEN_OPTIONS, CREATE_POST_SUCCESS_NAV } from '../lib/createPostPublish.ts';
import { getActivePostBackgrounds } from '../lib/postBackgrounds.ts';
import { PAW_LAYOUTS, PAWS_PER_LAYOUT, pawNativeViewsPerOverlay, pawOverlayCost } from '../lib/pawPrintLayout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('auditoría Feed / Crear / GEO', () => {
  it('el costo de huellas creció de 1 fondo a todos los fondos activos', () => {
    const active = getActivePostBackgrounds();
    const cost = pawOverlayCost(active);
    assert.equal(PAWS_PER_LAYOUT, 5);
    for (const layout of PAW_LAYOUTS) assert.equal(layout.length, PAWS_PER_LAYOUT);
    assert.equal(cost.iconsPerCard, 5);
    assert.equal(cost.historicalCardsWithPaws, 1);
    assert.equal(cost.currentCardsWithPaws, active.length);
    assert.ok(active.length >= 12);
    assert.equal(cost.extraIconsVsHistoricalIfAllVisible, (active.length - 1) * 5);
    assert.equal(pawNativeViewsPerOverlay(), 6);
    const card = read('components/PostBackgroundCard.tsx');
    assert.match(card, /<PawPrintOverlay color=\{bg\.textColor\} backgroundId=\{bg\.id\}/);
    assert.doesNotMatch(card, /pattern === 'paws'/);
    assert.match(read('components/PawPrintOverlay.tsx'), /name="paw"/);
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

  it('CreatePost modal no se copia a CreateAlert ni al navigator raíz', () => {
    const app = read('App.tsx');
    const rootNav = app.slice(app.indexOf('<Stack.Navigator>'), app.indexOf('// En Android, initialWindowMetrics'));
    assert.doesNotMatch(rootNav.slice(0, 80), /screenOptions=\{/);
    assert.equal(CREATE_POST_SCREEN_OPTIONS.presentation, 'modal');
    assert.equal(CREATE_POST_SCREEN_OPTIONS.animation, 'none');
    assert.equal(CREATE_POST_SUCCESS_NAV.merge, true);
    const postBlock = app.slice(app.indexOf('name="CreatePost"'), app.indexOf('name="CreateReel"'));
    assert.match(postBlock, /CREATE_POST_SCREEN_OPTIONS/);
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
