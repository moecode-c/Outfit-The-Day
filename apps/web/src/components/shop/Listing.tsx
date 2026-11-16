import { getLocale, getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/Reveal';
import { sapi, qs } from '@/lib/server';
import { Filters, PageNav, SortSelect } from './Filters';
import { ProductGrid } from './ProductCard';

/** Server-rendered product listing (SEO-friendly) with client-side filters that update the URL. */
export async function Listing({
  title,
  kicker,
  intro,
  query,
  sp,
  categories,
  hide,
}: {
  title: string;
  kicker?: string;
  intro?: string;
  query: Record<string, any>;
  sp: Record<string, string | string[] | undefined>;
  categories?: any[];
  hide?: string[];
}) {
  const t = await getTranslations('shop');
  await getLocale();
  const params: Record<string, any> = { limit: 24 };
  for (const k of ['q', 'category', 'seller', 'minPrice', 'maxPrice', 'rating', 'onSale', 'inStock', 'size', 'color', 'sort', 'page', 'department']) {
    const v = sp[k];
    if (typeof v === 'string' && v) params[k] = v;
  }
  Object.assign(params, query);
  const data = await sapi<any>(`/products${qs(params)}`, { revalidate: 15 });

  return (
    <div className="px-4 pt-14 md:px-10">
      <Reveal>
        {kicker && <p className="label mb-4 text-muted">{kicker}</p>}
        <h1 className="font-display text-6xl leading-none md:text-8xl">{title}</h1>
        {intro && <p className="mt-6 max-w-xl text-muted">{intro}</p>}
      </Reveal>
      <div className="mt-12 flex items-center justify-between border-y border-line py-4">
        <span className="label text-muted">{t('results', { n: data?.total ?? 0 })}</span>
        <div className="flex items-center gap-6">
          <span className="lg:hidden">
            <Filters facets={data?.facets} categories={categories} hide={hide} />
          </span>
          <SortSelect />
        </div>
      </div>
      <div className="mt-10 grid gap-12 lg:grid-cols-[220px_1fr]">
        <div className="hidden lg:block">
          <div className="sticky top-32">
            <Filters facets={data?.facets} categories={categories} hide={hide} />
          </div>
        </div>
        <div>
          {data?.items?.length ? <ProductGrid items={data.items} cols={3} /> : <p className="py-24 text-center text-muted">{t('noResults')}</p>}
          <PageNav page={data?.page ?? 1} pages={data?.pages ?? 1} />
        </div>
      </div>
    </div>
  );
}
