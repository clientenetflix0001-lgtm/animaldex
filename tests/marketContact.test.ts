import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LISTING_PATITAS_PURCHASE_DISABLED,
  listingInquiryMessage,
  listingPriceLabel,
  parseListingContact,
  resolveListingContactAction,
} from '../lib/listingContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const market = read('screens/MarketScreen.tsx');
const create = read('screens/CreateListingScreen.tsx');
const detail = read('screens/ListingDetailScreen.tsx');
const card = read('components/ListingCard.tsx');
const gallery = read('components/ListingImageGallery.tsx');
const worker = read('worker/index.js');
const homeFeed = read('lib/homeFeed.ts');
const feedWorker = worker.slice(worker.indexOf("if (action === 'homeFeed')"), worker.indexOf("if (action === 'listingDetail')"));
const listingRow = worker.slice(worker.indexOf('function listingRow'), worker.indexOf('const LISTING_SELECT'));

describe('mercado contacto y patitas', () => {
  it('Patitas no compra; listado vertical; galería fullscreen', () => {
    assert.equal(LISTING_PATITAS_PURCHASE_DISABLED, true);
    assert.doesNotMatch(detail, /handleBuy/);
    assert.doesNotMatch(detail, /La compra con Patitas/);
    assert.match(detail, /openListingContact/);
    assert.match(detail, /ListingImageGallery/);
    assert.match(gallery, /onRequestClose/);
    assert.match(gallery, /contentFit="contain"/);
    assert.match(gallery, /openAt/);
    assert.match(read('lib/market.ts'), /export const MARKET_LIST_COLUMNS = 2/);
    assert.match(market, /key="market-grid-2"/);
    assert.match(market, /numColumns=\{MARKET_LIST_COLUMNS\}/);
    assert.match(market, /columnWrapperStyle=\{styles\.gridRow\}/);
    assert.match(market, /gridCellDivider/);
    assert.match(market, /hairlineWidth/);
    assert.match(market, /navigate\('ListingDetail'/);
    assert.doesNotMatch(market, /horizontal\s*\n\s*data=\{listings\}/);
    assert.doesNotMatch(market, /HomeSectionRow/);
    assert.match(market, /localityPill/);
    assert.doesNotMatch(card, /formatPatitas/);
    assert.match(create, /contactMethod/);
    assert.doesNotMatch(create, /Precio en Patitas/);
  });

  it('WhatsApp, teléfono y productos antiguos', () => {
    const wa = parseListingContact('whatsapp', '+54 9 11 5555 1111');
    assert.equal(wa.ok, true);
    if (wa.ok) {
      const action = resolveListingContactAction({ method: wa.method, value: wa.value, title: 'Cama' });
      assert.equal(action.kind, 'whatsapp');
      if (action.kind === 'whatsapp') {
        assert.match(action.url, /^https:\/\/wa\.me\/5491155551111/);
        assert.match(action.url, /Hola%2C%20vi%20tu%20publicaci/);
        assert.equal(action.label, 'Contactar por WhatsApp');
      }
    }
    const tel = resolveListingContactAction({ method: 'phone', value: '+5491166662222', title: 'Paseo' });
    assert.equal(tel.kind, 'tel');
    if (tel.kind === 'tel') {
      assert.equal(tel.url, 'tel:+5491166662222');
      assert.equal(tel.label, 'Llamar');
    }
    const legacy = resolveListingContactAction({
      method: null,
      value: null,
      fallbackPhone: '+5491144443333',
      title: 'Antiguo',
    });
    assert.equal(legacy.kind, 'tel');
    const missing = resolveListingContactAction({ method: null, value: null, title: 'X' });
    assert.equal(missing.kind, 'none');
    assert.equal(listingInquiryMessage('Cama ortopédica'), 'Hola, vi tu publicación de Cama ortopédica en Animaldex.');
    assert.equal(listingPriceLabel(null), null);
    assert.equal(listingPriceLabel(8500), '$8.500');
    assert.match(worker, /action === 'listingContact'/);
    assert.match(worker, /contact_method/);
    assert.match(create, /WhatsApp/);
  });

  it('número no aparece en homeFeed ni listingRow', () => {
    assert.doesNotMatch(listingRow, /contact_method|contact_value|verified_phone/);
    assert.doesNotMatch(feedWorker, /contact_method|contact_value|listingContact/);
    assert.doesNotMatch(homeFeed, /contactValue|contact_method/);
    assert.match(worker, /function listingRow/);
  });
});
