import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LISTING_RENEW_MS,
  LISTING_RENEW_TOO_SOON,
  LISTING_SOLD_NOT_RENEWABLE,
  canRenewListing,
  isListingPublic,
  isListingSold,
  listingBumpedAt,
  listingRenewRejectReason,
  listingRenewalUi,
  listingStatusLabel,
} from '../lib/listingLifecycle.ts';
import { LISTING_PATITAS_PURCHASE_DISABLED } from '../lib/listingContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const market = read('screens/MarketScreen.tsx');
const card = read('components/ListingCard.tsx');
const mine = read('screens/MyListingsScreen.tsx');
const alerts = read('screens/AlertsScreen.tsx');
const app = read('App.tsx');
const worker = read('worker/index.js');
const db = read('lib/db.ts');
const types = read('lib/types.ts');
const migration = read('migrations/014_listing_renewed_at.sql');
const listingsFeed = worker.slice(worker.indexOf("if (action === 'listingsFeed')"), worker.indexOf("if (action === 'listingDetail')"));
const renewAct = worker.slice(worker.indexOf("if (action === 'renewListing')"), worker.indexOf("if (action === 'markListingSold')"));
const soldAct = worker.slice(worker.indexOf("if (action === 'markListingSold')"), worker.indexOf("if (action === 'listingFavorite')"));
const myAct = worker.slice(worker.indexOf("if (action === 'myListings')"), worker.indexOf("if (action === 'renewListing')"));

describe('mercado grilla visual', () => {
  it('2 columnas, fotos de lado a lado y datos conservados', () => {
    assert.match(read('lib/market.ts'), /export const MARKET_LIST_COLUMNS = 2/);
    assert.match(market, /numColumns=\{MARKET_LIST_COLUMNS\}/);
    assert.match(market, /key="market-grid-2"/);
    assert.match(card, /width: '100%'/);
    assert.match(card, /aspectRatio: 1/);
    assert.match(card, /contentFit="cover"/);
    assert.match(card, /listing\.title/);
    assert.match(card, /listingPriceLabel/);
    assert.match(card, /distanceLabel/);
    assert.match(card, /listing\.locality/);
    assert.match(card, /listing\.username/);
    assert.match(market, /navigate\('ListingDetail'/);
    assert.match(market, /gridCellDivider/);
    assert.match(market, /hairlineWidth/);
    assert.doesNotMatch(market, /horizontal\s*\n\s*data=\{listings\}/);
  });
});

describe('mis productos', () => {
  it('botón y navegación a gestión propia', () => {
    assert.match(market, /Mis productos/);
    assert.match(market, /mineProductsBtn/);
    assert.match(market, /navigate\(user \? 'MyListings' : 'Auth'\)/);
    assert.match(app, /name="MyListings"/);
    assert.match(app, /MyListingsScreen/);
    assert.match(types, /MyListings: undefined/);
    assert.match(db, /action: 'myListings'/);
  });

  it('solo listings del owner; renovar 7 días; no duplica', () => {
    assert.match(myAct, /l\.user_id = \?/);
    assert.match(myAct, /status IN \('active', 'sold'\)/);
    const now = 1_800_000_000_000;
    const fresh = { status: 'active', createdAt: now - 2 * 24 * 60 * 60 * 1000, renewedAt: null };
    const due = { status: 'active', createdAt: now - LISTING_RENEW_MS, renewedAt: null };
    assert.equal(canRenewListing(fresh, now), false);
    assert.equal(canRenewListing(due, now), true);
    assert.equal(listingRenewRejectReason(fresh, now), LISTING_RENEW_TOO_SOON);
    assert.equal(listingRenewRejectReason(due, now), null);
    assert.equal(listingRenewalUi(fresh, now).canRenew, false);
    assert.match(listingRenewalUi(fresh, now).label, /Podrás renovar en/);
    assert.equal(listingRenewalUi(due, now).label, 'Renovar publicación');
    assert.match(renewAct, /listingRenewRejectReason/);
    assert.match(renewAct, /SET renewed_at = \?, updated_at = \? WHERE id = \?/);
    assert.doesNotMatch(renewAct, /INSERT INTO listings/);
    assert.doesNotMatch(renewAct, /contact_method|contact_value|images/);
  });

  it('vendido sale del público y queda en historial', () => {
    assert.equal(isListingSold('sold'), true);
    assert.equal(isListingPublic('sold'), false);
    assert.equal(isListingPublic('active'), true);
    assert.equal(listingStatusLabel('sold'), 'Vendido');
    assert.equal(listingStatusLabel(undefined), 'Activo');
    assert.match(listingsFeed, /l\.status = 'active'/);
    assert.doesNotMatch(listingsFeed, /status = 'sold'/);
    assert.match(soldAct, /status = 'sold'/);
    assert.doesNotMatch(soldAct, /DELETE FROM listings/);
    assert.doesNotMatch(soldAct, /images|contact_method|contact_value/);
    assert.match(myAct, /'sold'/);
    assert.match(mine, /Marcar como vendido/);
    assert.match(mine, /isListingSold/);
    assert.match(mine, /item\.images/);
    assert.equal(listingBumpedAt({ createdAt: 10, renewedAt: null }), 10);
    assert.equal(listingBumpedAt({ createdAt: 10, renewedAt: 20 }), 20);
    assert.equal(listingRenewRejectReason({ status: 'sold', createdAt: 1 }, Date.now()), LISTING_SOLD_NOT_RENEWABLE);
  });

  it('producto viejo no crashea; Patitas y contacto intactos', () => {
    assert.equal(canRenewListing({ status: 'active', createdAt: 1, renewedAt: undefined }, 1 + LISTING_RENEW_MS), true);
    assert.match(migration, /ADD COLUMN renewed_at INTEGER/);
    assert.match(migration, /Do not run remotely/);
    assert.doesNotMatch(migration, /DROP|DELETE FROM listings/);
    assert.equal(LISTING_PATITAS_PURCHASE_DISABLED, true);
    assert.doesNotMatch(mine, /handleBuy|Patitas compra|checkout/);
    assert.match(worker, /action === 'listingContact'/);
  });
});

describe('alertas fila de acciones', () => {
  it('Crear alerta y Mis alertas en una fila, misma navegación', () => {
    assert.match(alerts, /alertActionsRow/);
    assert.match(alerts, /flexDirection: 'row'/);
    assert.match(alerts, /justifyContent: 'space-between'/);
    assert.match(alerts, /navigate\('CreateAlert'\)/);
    assert.match(alerts, /navigate\('MyAlerts'\)/);
    assert.equal((alerts.match(/function MyAlertsScreen|createMyAlerts/g) || []).length, 0);
    assert.match(app, /name="MyAlerts"/);
  });
});
