// Backup → wipe → restore round trip against a seeded database. Run from apps/api:
//
//   MONGODB_URI=mongodb://localhost:27017/otd_test node test/backup-roundtrip.mjs
//
// Checks that scripts/backup.mjs captures every collection, that a dry-run restore changes
// nothing, and that scripts/restore.mjs --confirm brings back the exact same documents
// (same counts, same _ids, same content hash) after the data has been deleted.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is not set');
const { EJSON } = mongoose.mongo.BSON;

async function snapshot(db) {
  const out = {};
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    out[name] = { count: docs.length, hash: createHash('sha256').update(EJSON.stringify(docs, { relaxed: false })).digest('hex') };
  }
  return out;
}

const run = (script, args, env = {}) =>
  execFileSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });

test('backup and restore round trip', async (t) => {
  const client = new mongoose.mongo.MongoClient(uri);
  await client.connect();
  t.after(() => client.close());
  const db = client.db();
  const root = mkdtempSync(path.join(tmpdir(), 'otd-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const before = await snapshot(db);
  const total = Object.values(before).reduce((n, c) => n + c.count, 0);
  assert.ok(total > 0, 'database is seeded');

  run('scripts/backup.mjs', [], { BACKUP_DIR: root, BACKUP_KEEP: '2' });
  const [name] = readdirSync(root);
  assert.ok(name?.startsWith('otd-'), 'backup folder created');
  const dir = path.join(root, name);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  await t.test('manifest lists every collection with its count', () => {
    assert.deepEqual(Object.keys(manifest.collections).sort(), Object.keys(before).sort());
    for (const [c, n] of Object.entries(manifest.collections)) assert.equal(n, before[c].count, c);
  });

  await t.test('dry run changes nothing', async () => {
    const out = run('scripts/restore.mjs', [dir]);
    assert.match(out, /dry run/);
    assert.deepEqual(await snapshot(db), before);
  });

  await t.test('restore brings back identical data after a wipe', async () => {
    for (const c of Object.keys(before)) await db.collection(c).deleteMany({});
    const wiped = await snapshot(db);
    assert.ok(Object.values(wiped).every((c) => c.count === 0), 'data deleted');
    run('scripts/restore.mjs', [dir, '--confirm']);
    assert.deepEqual(await snapshot(db), before);
  });
});
