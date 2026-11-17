import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { createStorage, DiskStorage, R2Storage, Storage } from './storage';

const text = async (r: Readable) => {
  const chunks: Buffer[] = [];
  for await (const c of r) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString();
};

describe('createStorage', () => {
  it('uses local disk unless R2_BUCKET is set', () => {
    expect(createStorage({}).name).toBe('disk');
  });

  it('uses R2 when fully configured', () => {
    const s = createStorage({ R2_BUCKET: 'b', R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' });
    expect(s.name).toBe('r2');
  });

  it('refuses a half-configured R2 instead of silently writing to disk', () => {
    expect(() => createStorage({ R2_BUCKET: 'b', R2_ACCOUNT_ID: 'a' })).toThrow(/R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are missing/);
  });
});

describe('DiskStorage', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'otd-store-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const s: Storage = new DiskStorage(root);

  it('round-trips a file and keeps visibilities apart', async () => {
    await s.put('private', 'a.pdf', Buffer.from('%PDF-1'), 'application/pdf');
    const got = await s.get('private', 'a.pdf');
    expect(got?.size).toBe(6);
    expect(await text(got!.body)).toBe('%PDF-1');
    expect(await s.get('public', 'a.pdf')).toBeNull();
  });

  it('cannot escape its folder with a crafted key', async () => {
    await s.put('public', '../../evil.png', Buffer.from('x'), 'image/png');
    const got = await s.get('public', 'evil.png');
    expect(got).not.toBeNull();
    // Read it so the stream is closed before the temp folder is removed.
    expect(await text(got!.body)).toBe('x');
  });
});

describe('R2Storage', () => {
  const cfg = { accountId: 'acc', accessKeyId: 'k', secretAccessKey: 's', bucket: 'otd' };

  it('writes under the visibility prefix with the right content type and cache policy', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new R2Storage(cfg, { send }).put('public', 'x.png', Buffer.from('png'), 'image/png');
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({ Bucket: 'otd', Key: 'public/x.png', ContentType: 'image/png', CacheControl: expect.stringContaining('immutable') });
  });

  it('marks private objects no-store', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new R2Storage(cfg, { send }).put('private', 'id.pdf', Buffer.from('%PDF'), 'application/pdf');
    expect(send.mock.calls[0][0].input).toMatchObject({ Key: 'private/id.pdf', CacheControl: 'private, no-store' });
  });

  it('reads objects back as a stream', async () => {
    const send = jest.fn().mockResolvedValue({ Body: Readable.from(['hello']), ContentType: 'image/png', ContentLength: 5 });
    const got = await new R2Storage(cfg, { send }).get('public', 'x.png');
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'otd', Key: 'public/x.png' });
    expect(got).toMatchObject({ mime: 'image/png', size: 5 });
    expect(await text(got!.body)).toBe('hello');
  });

  it('returns null for a missing object and rethrows other errors', async () => {
    const missing = Object.assign(new Error('nope'), { name: 'NoSuchKey' });
    expect(await new R2Storage(cfg, { send: jest.fn().mockRejectedValue(missing) } as any).get('public', 'x.png')).toBeNull();
    const boom = new Error('network');
    await expect(new R2Storage(cfg, { send: jest.fn().mockRejectedValue(boom) } as any).get('public', 'x.png')).rejects.toBe(boom);
  });
});
