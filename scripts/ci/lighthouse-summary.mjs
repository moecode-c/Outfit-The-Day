// Appends a Lighthouse score table (best run per page) to the GitHub job summary.
import fs from 'node:fs';
import path from 'node:path';

const dir = '.lighthouseci';
if (!fs.existsSync(dir)) process.exit(0);
const best = {};
for (const f of fs.readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f))) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const u = new URL(r.finalDisplayedUrl ?? r.finalUrl);
  const page = u.pathname + u.search;
  const s = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  if (!best[page] || s.performance > best[page].performance) best[page] = s;
}
let md = '### Lighthouse (best of runs)\n\n| Page | Performance | Accessibility | Best practices | SEO |\n|---|---|---|---|---|\n';
for (const [p, s] of Object.entries(best)) md += `| ${p} | ${s.performance} | ${s.accessibility} | ${s['best-practices']} | ${s.seo} |\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
