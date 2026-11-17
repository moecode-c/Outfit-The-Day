// Restores a backup made by scripts/backup.mjs.
//
//   pnpm --filter api restore -- ./backups/otd-2026-11-17T02-00-00-000Z            (dry run)
//   pnpm --filter api restore -- ./backups/otd-2026-11-17T02-00-00-000Z --confirm  (replace data)
//
// Without --confirm it only reports what would be restored. With --confirm, every collection in
// the backup is emptied and re-filled in the database named by MONGODB_URI. Collections that are
// not in the backup are left alone. Indexes are rebuilt by the API on its next start.
import 'dotenv/config';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const args = process.argv.slice(2).filter((a) => a !== '--');
const dir = args.find((a) => !a.startsWith('--'));
const confirm = args.includes('--confirm');
if (!dir || !process.env.MONGODB_URI) {
  console.error('Usage: restore.mjs <backup folder> [--confirm]   (needs MONGODB_URI)');
  process.exit(1);
}
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();
console.log(`Backup of "${manifest.database}" from ${manifest.createdAt} → database "${db.databaseName}"${confirm ? '' : ' (dry run, add --confirm to restore)'}`);

for (const [coll, expected] of Object.entries(manifest.collections)) {
  if (!confirm) {
    console.log(`  · ${coll.padEnd(22)} ${expected} documents (currently ${await db.collection(coll).estimatedDocumentCount()})`);
    continue;
  }
  const c = db.collection(coll);
  await c.deleteMany({});
  let batch = [];
  let n = 0;
  const rl = readline.createInterface({ input: createReadStream(path.join(dir, `${coll}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    batch.push(EJSON.parse(line, { relaxed: false }));
    if (batch.length === 1000) {
      await c.insertMany(batch, { ordered: false });
      n += batch.length;
      batch = [];
    }
  }
  if (batch.length) await c.insertMany(batch, { ordered: false });
  n += batch.length;
  if (n !== expected) throw new Error(`${coll}: restored ${n}, backup says ${expected}`);
  console.log(`  ✓ ${coll.padEnd(22)} ${n}`);
}
await client.close();
if (confirm) console.log('Restore complete.');
