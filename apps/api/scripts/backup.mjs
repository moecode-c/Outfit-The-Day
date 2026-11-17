// Logical database backup: every collection → gzipped Extended JSON lines (keeps ObjectIds and dates).
//
//   pnpm --filter api backup                      → ./backups/otd-<timestamp>/
//   BACKUP_DIR=/mnt/backups BACKUP_KEEP=30 pnpm --filter api backup
//
// Reads MONGODB_URI from the environment or apps/api/.env. Keeps the newest BACKUP_KEEP backups
// (default 14) in BACKUP_DIR. When R2_* is configured it also uploads the files to the bucket
// under backups/<name>/, so a copy survives the server. Uploaded files are stored separately
// (local disk or R2); this script covers the database only.
//
// In production on MongoDB Atlas, also enable Atlas Cloud Backup (continuous / point-in-time);
// this script is the portable, provider-independent copy.
import 'dotenv/config';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}
const root = path.resolve(process.env.BACKUP_DIR ?? './backups');
const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14));
const name = `otd-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const dir = path.join(root, name);

const client = new mongoose.mongo.MongoClient(uri);
await client.connect();
const db = client.db();
await fs.mkdir(dir, { recursive: true });

const manifest = { database: db.databaseName, createdAt: new Date().toISOString(), collections: {} };
const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith('system.'));
for (const { name: coll } of collections) {
  let count = 0;
  const cursor = db.collection(coll).find({}, { batchSize: 1000 });
  async function* lines() {
    for await (const doc of cursor) {
      count++;
      yield EJSON.stringify(doc, { relaxed: false }) + '\n';
    }
  }
  await pipeline(lines, createGzip(), createWriteStream(path.join(dir, `${coll}.jsonl.gz`)));
  manifest.collections[coll] = count;
  console.log(`  ✓ ${coll.padEnd(22)} ${count}`);
}
await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
await client.close();
console.log(`Backup written to ${dir}`);

// Optional off-site copy in R2.
if (process.env.R2_BUCKET) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  for (const f of await fs.readdir(dir)) {
    const { size } = await fs.stat(path.join(dir, f));
    await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: `backups/${name}/${f}`, Body: createReadStream(path.join(dir, f)), ContentLength: size }));
  }
  console.log(`Uploaded to r2://${process.env.R2_BUCKET}/backups/${name}/`);
}

// Retention: newest `keep` local backups survive.
const old = (await fs.readdir(root)).filter((d) => /^otd-\d{4}-/.test(d)).sort().reverse().slice(keep);
for (const d of old) await fs.rm(path.join(root, d), { recursive: true, force: true });
if (old.length) console.log(`Removed ${old.length} old backup(s)`);
