// Run the whole CI test suite locally against a throwaway database:  pnpm test:all
// Needs MongoDB on localhost:27017. Uses DB "otd_test", API on :4100 and web on :3100,
// so it does not touch your dev data or the dev servers on :3000/:4000.
//   --skip-build   reuse existing builds (apps/api/dist, apps/web/.next-test)
//   --only=unit|lint|api|e2e   run a single stage
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const skipBuild = args.includes('--skip-build');
const stage = (name) => !only || only === name;

const MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://localhost:27017/otd_test';
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'otd-uploads-'));
const env = {
  ...process.env,
  MONGODB_URI,
  THROTTLE_DISABLED: 'true',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'local-test-access',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'local-test-refresh',
  WEB_ORIGIN: 'http://localhost:3100',
  UPLOAD_DIR: uploads,
};
const children = [];
const results = [];

function run(title, cmd, cwd = root, extraEnv = {}) {
  console.log(`\n━━ ${title}\n$ ${cmd}`);
  const r = spawnSync(cmd, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit', shell: true });
  results.push([title, r.status === 0]);
  if (r.status !== 0) throw new Error(`${title} failed`);
}
function start(title, cmd, cwd, extraEnv = {}) {
  const log = fs.openSync(path.join(uploads, title.replace(/\W+/g, '-') + '.log'), 'w');
  const p = spawn(cmd, { cwd, env: { ...env, ...extraEnv }, stdio: ['ignore', log, log], shell: true, detached: process.platform !== 'win32' });
  children.push(p);
  console.log(`started ${title} (logs: ${uploads})`);
}
function stopAll() {
  for (const p of children) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else try { process.kill(-p.pid); } catch {}
  }
  children.length = 0;
}
const seed = () => run('seed test DB', 'pnpm --filter api seed');
const api = path.join(root, 'apps/api');
const web = path.join(root, 'apps/web');

try {
  if (stage('lint')) {
    run('lint', 'pnpm -r lint');
    run('typecheck', 'pnpm -r typecheck');
  }
  if (stage('unit')) run('unit tests', 'pnpm test');
  if ((stage('api') || stage('e2e')) && !skipBuild) {
    run('build shared + api', 'pnpm --filter @otd/shared build && pnpm --filter api build');
  }
  if (stage('api')) {
    seed();
    start('api', 'node dist/main', api, { PORT: '4100' });
    run('wait for api', 'node scripts/wait-for.mjs http://localhost:4100/api/health 60');
    run('api integration', 'pnpm --filter api test:int', root, { API: 'http://localhost:4100/api' });
    seed();
    run('api scenario', 'pnpm --filter api test:e2e', root, { API: 'http://localhost:4100/api' });
    stopAll();
  }
  if (stage('e2e')) {
    const webEnv = { API_URL: 'http://localhost:4100', NEXT_DIST_DIR: '.next-test' };
    if (!skipBuild) run('build web', 'pnpm --filter web build', root, webEnv);
    seed();
    start('api', 'node dist/main', api, { PORT: '4100' });
    start('web', 'npx next start -p 3100', web, webEnv);
    run('wait for api', 'node scripts/wait-for.mjs http://localhost:4100/api/health 60');
    run('wait for web', 'node scripts/wait-for.mjs http://localhost:3100/en 120');
    run('playwright', 'pnpm --filter web test:e2e', root, { WEB_URL: 'http://localhost:3100' });
  }
} catch (e) {
  console.error('\n✖ ' + e.message);
  process.exitCode = 1;
} finally {
  stopAll();
  console.log('\nSummary');
  for (const [t, ok] of results) console.log(`  ${ok ? '✔' : '✖'} ${t}`);
}
