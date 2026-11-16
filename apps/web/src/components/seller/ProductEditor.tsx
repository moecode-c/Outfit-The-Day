'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { egpInput, fromEgp, Section } from '@/components/panel';
import { ProductStatus } from '@/components/shop/Status';
import { Button, ErrorText, Field, I18nInput, ImagesInput, Input, Notice, Select, toast, useAction, useLoad } from '@/components/ui';
import { useRouter } from '@/i18n/routing';
import { api, post, put } from '@/lib/api';
import { tx } from '@/lib/format';

const FAMILIES = ['black', 'white', 'grey', 'beige', 'brown', 'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple', 'gold', 'silver', 'multi'];
const DEPTS = ['WOMEN', 'MEN', 'KIDS', 'UNISEX'];
const uid = () => 'c' + Math.random().toString(36).slice(2, 9);

type Color = { key: string; name: { en: string; ar: string }; hex: string; family: string; images: string[] };
type Variant = { key?: string; colorKey: string; size: string; sku: string; stock: number; price: string };
type L2 = { en: string; ar: string };
type Form = { category: string; department: string; title: L2; description: L2; material: L2; care: L2; price: string; sizeGuide: string; specs: any[]; colors: Color[]; variants: Variant[] };

function fromProduct(p: any): Form {
  if (!p) {
    const key = uid();
    return {
      category: '', department: 'WOMEN', title: { en: '', ar: '' }, description: { en: '', ar: '' }, material: { en: '', ar: '' }, care: { en: '', ar: '' },
      price: '', sizeGuide: '', specs: [] as any[],
      colors: [{ key, name: { en: 'Black', ar: 'أسود' }, hex: '#111111', family: 'black', images: [] }] as Color[],
      variants: ['S', 'M', 'L'].map((size) => ({ colorKey: key, size, sku: '', stock: 0, price: '' })) as Variant[],
    };
  }
  return {
    category: String(p.category), department: p.department, title: p.title, description: p.description ?? { en: '', ar: '' },
    material: p.material ?? { en: '', ar: '' }, care: p.care ?? { en: '', ar: '' }, price: egpInput(p.price), sizeGuide: p.sizeGuide ? String(p.sizeGuide) : '',
    specs: p.specs ?? [],
    colors: p.colors.map((c: any) => ({ key: String(c._id), name: c.name, hex: c.hex || '#000000', family: c.family || 'black', images: c.images })),
    variants: p.variants.map((v: any) => ({ key: String(v._id), colorKey: String(v.color), size: v.size, sku: v.sku ?? '', stock: v.stock, price: egpInput(v.price) })),
  };
}

export function ProductEditor({ product, onSaved }: { product?: any; onSaved?: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const cats = useLoad<any[]>(() => api('/categories'), []);
  const guides = useLoad<any[]>(() => api('/seller/size-guides'), []);
  const [f, setF] = useState<Form>(() => fromProduct(product));
  const [sizesText, setSizesText] = useState('XS, S, M, L, XL');
  const { busy, error, run } = useAction();
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  const setColor = (i: number, patch: Partial<Color>) => set({ colors: f.colors.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const setVariant = (i: number, patch: Partial<Variant>) => set({ variants: f.variants.map((v, k) => (k === i ? { ...v, ...patch } : v)) });

  const generate = (colorKey: string) => {
    const sizes = sizesText.split(',').map((s) => s.trim()).filter(Boolean);
    const existing = new Set(f.variants.filter((v) => v.colorKey === colorKey).map((v) => v.size.toUpperCase()));
    set({ variants: [...f.variants, ...sizes.filter((s) => !existing.has(s.toUpperCase())).map((size) => ({ colorKey, size, sku: '', stock: 0, price: '' }))] });
  };

  const save = (submit: boolean) =>
    run(async () => {
      const body = {
        category: f.category, department: f.department, title: f.title, description: f.description, material: f.material, care: f.care,
        specs: f.specs.filter((s: any) => s.label?.en || s.label?.ar),
        price: fromEgp(f.price) ?? 0, sizeGuide: f.sizeGuide || null,
        colors: f.colors,
        variants: f.variants.map((v) => ({ key: v.key, colorKey: v.colorKey, size: v.size, sku: v.sku, stock: Number(v.stock) || 0, price: fromEgp(v.price) })),
        submit,
      };
      const p = product ? await put(`/seller/products/${product._id}`, body) : await post('/seller/products', body);
      toast(tc('done'));
      if (!product) router.replace(`/seller/products/${p._id}`);
      else onSaved?.();
    });

  const roots = (cats.data ?? []).filter((c) => !c.parent);
  const children = (id: string) => (cats.data ?? []).filter((c) => String(c.parent) === id);

  return (
    <div className="max-w-4xl">
      {product && (
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <ProductStatus s={product.status} />
          {product.status === 'REJECTED' && product.statusReason && <span className="text-sm text-danger">{product.statusReason}</span>}
        </div>
      )}
      <Notice>{t('reviewNote')}</Notice>

      <Section title={t('basics')}>
        <div className="grid gap-6">
          <I18nInput label={t('title')} value={f.title} onChange={(title) => set({ title })} required />
          <I18nInput label={t('description')} value={f.description} onChange={(description) => set({ description })} textarea />
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label={t('category')}>
              <Select required value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">—</option>
                {roots.map((r) => (
                  <optgroup key={r._id} label={tx(r.name, locale)}>
                    <option value={r._id}>{tx(r.name, locale)}</option>
                    {children(r._id).map((c) => <option key={c._id} value={c._id}>— {tx(c.name, locale)}</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label={t('department')}>
              <Select value={f.department} onChange={(e) => set({ department: e.target.value })}>
                {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label={t('basePrice')}><Input type="number" min={1} step="0.01" required value={f.price} onChange={(e) => set({ price: e.target.value })} dir="ltr" /></Field>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <I18nInput label={t('material')} value={f.material} onChange={(material) => set({ material })} />
            <I18nInput label={t('care')} value={f.care} onChange={(care) => set({ care })} />
          </div>
          <Field label={t('sizeGuide')}>
            <Select value={f.sizeGuide} onChange={(e) => set({ sizeGuide: e.target.value })}>
              <option value="">{tc('none')}</option>
              {(guides.data ?? []).map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title={t('colors')} actions={<button className="label underline underline-offset-4" onClick={() => set({ colors: [...f.colors, { key: uid(), name: { en: '', ar: '' }, hex: '#888888', family: 'grey', images: [] }] })}>+ {t('addColor')}</button>}>
        <div className="space-y-10">
          {f.colors.map((c, i) => (
            <div key={c.key} className="border border-line p-5">
              <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_120px_140px_auto]">
                <Field label={`${t('colorName')} (EN)`}><Input value={c.name.en} onChange={(e) => setColor(i, { name: { ...c.name, en: e.target.value } })} /></Field>
                <Field label={`${t('colorName')} (AR)`}><Input dir="rtl" value={c.name.ar} onChange={(e) => setColor(i, { name: { ...c.name, ar: e.target.value } })} /></Field>
                <Field label="Hex"><input type="color" value={c.hex} onChange={(e) => setColor(i, { hex: e.target.value })} className="h-11 w-full cursor-pointer border border-line bg-transparent" /></Field>
                <Field label={t('family')}>
                  <Select value={c.family} onChange={(e) => setColor(i, { family: e.target.value })}>{FAMILIES.map((x) => <option key={x}>{x}</option>)}</Select>
                </Field>
                {f.colors.length > 1 && (
                  <button className="label mb-3 text-muted underline" onClick={() => set({ colors: f.colors.filter((_, k) => k !== i), variants: f.variants.filter((v) => v.colorKey !== c.key) })}>{tc('remove')}</button>
                )}
              </div>
              <div className="mt-5"><Field label={t('photos')}><ImagesInput value={c.images} onChange={(images) => setColor(i, { images })} /></Field></div>

              <div className="mt-6">
                <p className="label mb-3">{t('variants')}</p>
                <div className="space-y-2">
                  {f.variants.map((v, vi) => v.colorKey !== c.key ? null : (
                    <div key={vi} className="grid grid-cols-[80px_1fr_90px_110px_auto] items-center gap-2">
                      <Input value={v.size} onChange={(e) => setVariant(vi, { size: e.target.value })} placeholder="M" />
                      <Input value={v.sku} onChange={(e) => setVariant(vi, { sku: e.target.value })} placeholder={t('sku')} dir="ltr" />
                      <Input type="number" min={0} value={v.stock} onChange={(e) => setVariant(vi, { stock: Number(e.target.value) })} title={t('stock')} />
                      <Input type="number" min={0} step="0.01" value={v.price} onChange={(e) => setVariant(vi, { price: e.target.value })} placeholder={t('priceOverride')} dir="ltr" />
                      <button className="px-2 text-muted hover:text-ink" onClick={() => set({ variants: f.variants.filter((_, k) => k !== vi) })} aria-label={tc('remove')}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button className="label underline underline-offset-4" onClick={() => set({ variants: [...f.variants, { colorKey: c.key, size: '', sku: '', stock: 0, price: '' }] })}>+ {t('addSize')}</button>
                  <span className="text-subtle">·</span>
                  <Input className="max-w-56" value={sizesText} onChange={(e) => setSizesText(e.target.value)} aria-label={t('sizes')} />
                  <button className="label underline underline-offset-4" onClick={() => generate(c.key)}>{t('generate')}</button>
                </div>
                <p className="mt-2 text-xs text-muted">{t('sizes')} · {t('stock')} · {t('priceOverride')}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('specs')} actions={<button className="label underline underline-offset-4" onClick={() => set({ specs: [...f.specs, { label: { en: '', ar: '' }, value: { en: '', ar: '' } }] })}>+ {t('addSpec')}</button>}>
        <div className="space-y-3">
          {f.specs.map((s: any, i: number) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <Input placeholder={`${t('label')} EN`} value={s.label.en} onChange={(e) => set({ specs: f.specs.map((x: any, k: number) => (k === i ? { ...x, label: { ...x.label, en: e.target.value } } : x)) })} />
              <Input placeholder={`${t('label')} AR`} dir="rtl" value={s.label.ar} onChange={(e) => set({ specs: f.specs.map((x: any, k: number) => (k === i ? { ...x, label: { ...x.label, ar: e.target.value } } : x)) })} />
              <Input placeholder={`${t('value')} EN`} value={s.value.en} onChange={(e) => set({ specs: f.specs.map((x: any, k: number) => (k === i ? { ...x, value: { ...x.value, en: e.target.value } } : x)) })} />
              <Input placeholder={`${t('value')} AR`} dir="rtl" value={s.value.ar} onChange={(e) => set({ specs: f.specs.map((x: any, k: number) => (k === i ? { ...x, value: { ...x.value, ar: e.target.value } } : x)) })} />
              <button className="px-2 text-muted" onClick={() => set({ specs: f.specs.filter((_: any, k: number) => k !== i) })}>✕</button>
            </div>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 mt-12 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-4 backdrop-blur md:-mx-10 md:px-10">
        <ErrorText error={error} />
        <div className="ms-auto flex gap-3">
          <Button variant="outline" loading={busy} onClick={() => save(false)}>{t('saveDraft')}</Button>
          <Button loading={busy} onClick={() => save(true)}>{product && product.status === 'LIVE' ? t('saveChanges') : t('submitReview')}</Button>
        </div>
      </div>
    </div>
  );
}

/** Seller discount + quick stock panel shown on the product page. */
export function DiscountPanel({ product, onSaved }: { product: any; onSaved: () => void }) {
  const t = useTranslations('seller');
  const tc = useTranslations('common');
  const d = product.discount ?? {};
  const toLocal = (x?: string) => (x ? new Date(x).toISOString().slice(0, 16) : '');
  const [f, setF] = useState({ type: d.type ?? '', value: d.type === 'FIXED_PRICE' ? egpInput(d.value) : d.value ?? '', startsAt: toLocal(d.startsAt), endsAt: toLocal(d.endsAt) });
  const { busy, error, run } = useAction();
  return (
    <Section title={t('discount')}>
      <div className="grid items-end gap-4 sm:grid-cols-4">
        <Field label={t('discountType')}>
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="">{t('noDiscount')}</option>
            <option value="PERCENT">{t('percent')}</option>
            <option value="FIXED_PRICE">{t('fixedPrice')}</option>
          </Select>
        </Field>
        {f.type && (
          <>
            <Field label={f.type === 'PERCENT' ? '%' : 'EGP'}><Input type="number" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
            <Field label={t('startsAt')}><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label={t('endsAt')}><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          </>
        )}
      </div>
      <ErrorText error={error} />
      <Button className="mt-4" size="sm" variant="outline" loading={busy} onClick={() => run(async () => {
        await put(`/seller/products/${product._id}/discount`, {
          type: f.type || null,
          value: !f.type ? null : f.type === 'PERCENT' ? Number(f.value) : fromEgp(String(f.value)),
          startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
          endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        });
        toast(tc('done'));
        onSaved();
      })}>{tc('save')}</Button>
    </Section>
  );
}
