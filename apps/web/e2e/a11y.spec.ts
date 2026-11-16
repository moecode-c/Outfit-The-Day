import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buyableProduct } from './helpers';

// Side test: automated accessibility audit (WCAG 2.1 A/AA rules) on key pages, both languages.
// Fails on "critical" and "serious" violations; lists the rest in the report.
const pages = async (request: any) => {
  const { p } = await buyableProduct(request);
  return ['', '/women', '/brands', `/p/${p.slug}`, '/login', '/register', '/bag'];
};

for (const locale of ['en', 'ar']) {
  test(`accessibility audit (${locale})`, async ({ page, request }, info) => {
    const results: string[] = [];
    for (const path of await pages(request)) {
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of violations) {
        results.push(`[${v.impact}] ${locale}${path || '/'} ${v.id}: ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0]?.target.join(' ')})`);
      }
    }
    await info.attach('axe-report', { body: results.join('\n') || 'no violations', contentType: 'text/plain' });
    const blocking = results.filter((r) => r.startsWith('[critical]') || r.startsWith('[serious]'));
    expect(blocking, blocking.join('\n')).toEqual([]);
  });
}
