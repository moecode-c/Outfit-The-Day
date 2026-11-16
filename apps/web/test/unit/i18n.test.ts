import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

type Tree = { [k: string]: string | Tree };

const flatten = (t: Tree, prefix = ''): Record<string, string> =>
  Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});

const EN = flatten(en as Tree);
const AR = flatten(ar as Tree);
// ICU argument names, e.g. {count}, {handle}; ignores plural/select branch bodies.
const args = (s: string) => [...s.matchAll(/\{\s*(\w+)\s*(?:[,}])/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('English and Arabic have exactly the same keys', () => {
    const missingInAr = Object.keys(EN).filter((k) => !(k in AR));
    const missingInEn = Object.keys(AR).filter((k) => !(k in EN));
    expect({ missingInAr, missingInEn }).toEqual({ missingInAr: [], missingInEn: [] });
  });

  it('has no empty strings', () => {
    const empty = [...Object.entries(EN), ...Object.entries(AR)].filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('uses the same placeholders in both languages', () => {
    const bad = Object.keys(EN).filter((k) => k in AR && args(EN[k]).join() !== args(AR[k]).join());
    expect(bad).toEqual([]);
  });

  it('Arabic strings are actually translated', () => {
    const arabic = Object.values(AR).filter((v) => /[؀-ۿ]/.test(v)).length;
    expect(arabic / Object.keys(AR).length).toBeGreaterThan(0.9);
  });

  it('every static t("key") used in the code exists', () => {
    const root = path.resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string) =>
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      });
    walk(root);

    const missing: string[] = [];
    let checked = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      // const t = useTranslations('ns')  |  const t = await getTranslations('ns')  |  getTranslations({ locale, namespace: 'ns' })
      const bindings = [
        ...src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*(?:'([\w.]*)'|\{[^}]*namespace:\s*'([\w.]+)'[^}]*\})?\s*\)/g),
      ];
      // The same name (usually `t`) can be bound to different namespaces in different components of one file.
      const byVar = new Map<string, Set<string>>();
      for (const m of bindings) byVar.set(m[1], (byVar.get(m[1]) ?? new Set()).add(m[2] ?? m[3] ?? ''));
      const exists = (key: string) => key in EN || Object.keys(EN).some((k) => k.startsWith(key + '.'));
      for (const [v, namespaces] of byVar) {
        for (const m of src.matchAll(new RegExp(`(?<![\\w.])${v}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*'([\\w.]+)'`, 'g'))) {
          checked++;
          const candidates = [...namespaces].map((ns) => (ns ? `${ns}.${m[1]}` : m[1]));
          if (!candidates.some(exists)) missing.push(`${path.relative(root, file)}: ${candidates.join(' | ')}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(missing).toEqual([]);
  });
});
