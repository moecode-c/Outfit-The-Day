import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { memoryStorage } from 'multer';
import { Model } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../common/auth';
import { createStorage, Storage } from './storage';

export { uploadRoot } from './storage';

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, 'application/pdf': 'pdf' };
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(DOC_TYPES).map(([m, e]) => [e, m]));

const SAFE_KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|avif|pdf)$/;

/**
 * Uploads. Bytes go to local disk (dev) or Cloudflare R2 (when R2_BUCKET is set), see storage.ts.
 * Public images: /uploads/<key>. Private docs and payment proofs: /api/files/private/<key>,
 * readable only by the owner, admins and users added to visibleTo.
 */
@Injectable()
export class FilesService {
  readonly storage: Storage = createStorage();
  constructor(@InjectModel('File') private readonly files: Model<any>) {}

  async save(file: Express.Multer.File, owner: string, visibility: 'public' | 'private') {
    if (!file) throw new BadRequestException('No file');
    const allowed = visibility === 'public' ? IMAGE_TYPES : DOC_TYPES;
    const ext = allowed[file.mimetype];
    if (!ext) throw new BadRequestException('Unsupported file type');
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large (max 8MB)');
    if (!this.sniff(file.buffer, ext)) throw new BadRequestException('File content does not match its type');
    const key = `${randomUUID()}.${ext}`;
    await this.storage.put(visibility, key, file.buffer, file.mimetype);
    await this.files.create({ key, owner, visibility, mime: file.mimetype, size: file.size, visibleTo: [] });
    return { key, url: visibility === 'public' ? `/uploads/${key}` : `/api/files/private/${key}` };
  }

  /** Magic-number check so renamed executables are rejected. */
  private sniff(b: Buffer, ext: string) {
    const hex = b.subarray(0, 12).toString('hex');
    if (ext === 'jpg') return hex.startsWith('ffd8ff');
    if (ext === 'png') return hex.startsWith('89504e47');
    if (ext === 'webp') return hex.startsWith('52494646') && b.subarray(8, 12).toString() === 'WEBP';
    if (ext === 'pdf') return b.subarray(0, 4).toString() === '%PDF';
    if (ext === 'avif') return b.subarray(4, 12).toString().startsWith('ftyp');
    return false;
  }

  keyOf(url?: string | null) {
    return url ? url.split('/').pop()! : '';
  }

  /** Make sure a private file belongs to the user before attaching it to something. */
  async assertOwned(url: string, userId: string) {
    const f = await this.files.findOne({ key: this.keyOf(url) }).lean<any>();
    if (!f || String(f.owner) !== String(userId)) throw new BadRequestException('Invalid file reference');
    return f;
  }

  async share(url: string | undefined | null, userIds: any[]) {
    if (!url) return;
    await this.files.updateOne({ key: this.keyOf(url) }, { $addToSet: { visibleTo: { $each: userIds.filter(Boolean) } } });
  }

  async readPrivate(key: string, user: AuthUser) {
    const f = await this.files.findOne({ key, visibility: 'private' }).lean<any>();
    if (!f) throw new NotFoundException();
    const ok =
      user.role === 'ADMIN' || String(f.owner) === user.id || (f.visibleTo ?? []).some((v: any) => String(v) === user.id);
    if (!ok) throw new ForbiddenException();
    const obj = await this.storage.get('private', key);
    if (!obj) throw new NotFoundException();
    return { ...obj, mime: f.mime };
  }

  /** Express handler for GET /uploads/:key (public images, same URL for disk and R2). */
  servePublic() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = req.path.replace(/^\//, '');
      if (!SAFE_KEY.test(key)) return res.status(404).end();
      try {
        const obj = await this.storage.get('public', key);
        if (!obj) return res.status(404).end();
        res.setHeader('Content-Type', obj.mime ?? MIME_BY_EXT[key.split('.').pop()!]);
        if (obj.size) res.setHeader('Content-Length', String(obj.size));
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        obj.body.on('error', next).pipe(res);
      } catch (e) {
        next(e);
      }
    };
  }
}

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File, @Query('visibility') visibility: string, @CurrentUser() u: AuthUser) {
    return this.files.save(file, u.id, visibility === 'private' ? 'private' : 'public');
  }

  @Get('private/:key')
  async private(@Param('key') key: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const f = await this.files.readPrivate(key, u);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (f.size) res.setHeader('Content-Length', String(f.size));
    f.body.pipe(res);
  }
}

@Global()
@Module({ providers: [FilesService], controllers: [FilesController], exports: [FilesService] })
export class FilesModule {}
