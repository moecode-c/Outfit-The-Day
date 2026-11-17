import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export type Visibility = 'public' | 'private';

/** Where uploaded bytes live. Keys are flat `<uuid>.<ext>` names; visibility is a folder/prefix. */
export interface Storage {
  readonly name: 'disk' | 'r2';
  put(visibility: Visibility, key: string, body: Buffer, mime: string): Promise<void>;
  /** Null when the object does not exist. */
  get(visibility: Visibility, key: string): Promise<{ body: Readable; mime?: string; size?: number } | null>;
}

export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? './uploads');

/** Local disk under UPLOAD_DIR (dev and tests). */
export class DiskStorage implements Storage {
  readonly name = 'disk' as const;
  constructor(private readonly root = uploadRoot()) {}

  private file(visibility: Visibility, key: string) {
    return path.join(this.root, visibility, path.basename(key));
  }

  async put(visibility: Visibility, key: string, body: Buffer) {
    await fs.mkdir(path.join(this.root, visibility), { recursive: true });
    await fs.writeFile(this.file(visibility, key), body);
  }

  async get(visibility: Visibility, key: string) {
    const f = this.file(visibility, key);
    try {
      const { size } = await fs.stat(f);
      const { createReadStream } = await import('fs');
      return { body: createReadStream(f), size };
    } catch {
      return null;
    }
  }
}

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; endpoint?: string };

/** Cloudflare R2 (S3-compatible). One private bucket; objects under `public/` and `private/` prefixes. */
export class R2Storage implements Storage {
  readonly name = 'r2' as const;
  constructor(
    private readonly cfg: R2Config,
    private readonly client: Pick<S3Client, 'send'> = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    }),
  ) {}

  private objectKey(visibility: Visibility, key: string) {
    return `${visibility}/${path.basename(key)}`;
  }

  async put(visibility: Visibility, key: string, body: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: this.objectKey(visibility, key),
        Body: body,
        ContentType: mime,
        CacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
  }

  async get(visibility: Visibility, key: string) {
    try {
      const r: any = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.objectKey(visibility, key) }));
      if (!r.Body) return null;
      return { body: r.Body as Readable, mime: r.ContentType, size: r.ContentLength };
    } catch (e: any) {
      if (e instanceof NoSuchKey || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
}

/** R2 when R2_BUCKET is set (all four R2_* vars required), otherwise local disk. */
export function createStorage(env: NodeJS.ProcessEnv = process.env): Storage {
  if (!env.R2_BUCKET) return new DiskStorage();
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`R2_BUCKET is set but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing`);
  return new R2Storage({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET,
    endpoint: env.R2_ENDPOINT,
  });
}
