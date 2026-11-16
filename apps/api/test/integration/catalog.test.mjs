// Public catalog: listing, filters, sorting, search, content.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { client } from './client.mjs';

const g = client();
const get = async (p) => {
  const r = await g.get(p);
  assert.equal(r.status, 200, `${p} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

describe('catalog', () => {
  it('lists approved products with pagination', async () => {
    const all = await get('/products?limit=5');
    assert.ok(all.total >= 15, 'seeded products: ' + all.total);
    assert.equal(all.items.length, 5);
    const p2 = await get('/products?limit=5&page=2');
    assert.notEqual(p2.items[0]._id, all.items[0]._id);
    for (const p of all.items) {
      assert.ok(p.slug && p.title?.en && p.effectivePrice > 0, 'product shape');
      assert.equal(p.status ?? 'APPROVED', 'APPROVED');
    }
  });

  it('sorts by price both ways', async () => {
    const asc = (await get('/products?sort=price_asc&limit=48&facets=false')).items.map((p) => p.effectivePrice);
    const desc = (await get('/products?sort=price_desc&limit=48&facets=false')).items.map((p) => p.effectivePrice);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  });

  it('filters by department, sale and price range', async () => {
    const men = await get('/products?department=men&limit=48&facets=false');
    assert.ok(men.items.length > 0 && men.items.every((p) => ['MEN', 'UNISEX'].includes(p.department)), 'men + unisex');
    assert.ok(men.items.some((p) => p.department === 'MEN'));
    const sale = await get('/products?onSale=true&limit=48&facets=false');
    assert.ok(sale.items.length > 0 && sale.items.every((p) => p.onSale));
    // Price filters take EGP; prices are stored in piasters.
    const ranged = await get('/products?minPrice=1000&maxPrice=2000&limit=48&facets=false');
    assert.ok(ranged.items.length > 0 && ranged.items.every((p) => p.effectivePrice >= 100000 && p.effectivePrice <= 200000), 'price range');
  });

  it('searches in English and in Arabic with normalization', async () => {
    assert.ok((await get('/products?q=dress')).total >= 1);
    assert.ok((await get('/products?q=' + encodeURIComponent('فستان'))).total >= 1);
    assert.ok((await get('/products?q=' + encodeURIComponent('اتيليه'))).total >= 1, 'alef variants fold');
    assert.equal((await get('/products?q=zzqqxxnotathing')).total, 0);
  });

  it('treats regex characters in search as literal text', async () => {
    const r = await g.get('/products?q=' + encodeURIComponent('.*(['));
    assert.equal(r.status, 200);
  });

  it('returns product detail with variants and seller', async () => {
    const [first] = (await get('/products?limit=1')).items;
    const p = await get('/products/' + first.slug);
    assert.ok(Array.isArray(p.variants) && p.variants.length > 0);
    assert.ok(p.seller?.slug, 'seller attached');
    assert.equal(p.seller.instapayHandle, undefined, 'no private seller fields in public detail');
  });

  it('serves categories, brands, looks, governorates and CMS content', async () => {
    const cats = await get('/categories');
    assert.ok(cats.length >= 10 && cats.some((c) => c.slug === 'dresses'));
    const brands = await get('/brands');
    const list = Array.isArray(brands) ? brands : brands.items;
    assert.ok(list.length >= 3);
    const brand = await get('/brands/' + list[0].slug);
    assert.ok(brand);
    const looks = await get('/looks');
    assert.ok((Array.isArray(looks) ? looks : looks.items).length >= 1);
    const gov = await get('/geo/governorates');
    assert.equal(gov.length, 27, 'all 27 Egyptian governorates');
    const home = await get('/content/home');
    assert.ok(home.banners.length > 0 && home.newIn.length > 0);
    assert.ok(await get('/content/config'));
  });

  it('returns 404 for unknown brand / CMS page', async () => {
    assert.equal((await g.get('/brands/no-such-brand-xyz')).status, 404);
    assert.equal((await g.get('/pages/no-such-page-xyz')).status, 404);
  });
});
