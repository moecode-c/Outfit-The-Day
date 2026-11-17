import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Model } from 'mongoose';
import { z } from 'zod';
import { ACCESS_COOKIE, AuthUser, CurrentUser, Public, REFRESH_COOKIE } from '../common/auth';
import { addHours, Zod, zEgPhone } from '../common/util';
import { NotifyService } from './notify';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const RegisterDto = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: zEgPhone,
  password: z.string().min(8).max(100),
  locale: z.enum(['en', 'ar']).default('en'),
});
const LoginDto = z.object({ identifier: z.string().min(3), password: z.string().min(1) });

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User') private readonly users: Model<any>,
    @InjectModel('Seller') private readonly sellers: Model<any>,
    private readonly jwt: JwtService,
    private readonly notify: NotifyService,
  ) {}

  private cookieOpts(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  async issue(user: any, res: Response) {
    const payload = { sub: String(user._id), role: user.role, perms: user.adminPerms ?? [], name: user.name, email: user.email };
    const access = this.jwt.sign(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' });
    const refreshRaw = randomBytes(32).toString('hex');
    const refresh = this.jwt.sign({ sub: payload.sub, r: refreshRaw }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' });
    await this.users.updateOne({ _id: user._id }, { refreshHash: sha(refreshRaw) });
    res.cookie(ACCESS_COOKIE, access, this.cookieOpts(15 * 60_000));
    res.cookie(REFRESH_COOKIE, refresh, this.cookieOpts(30 * 86_400_000));
    return this.me(String(user._id));
  }

  async me(id: string) {
    const u = await this.users.findById(id).select('name email phone role adminPerms locale emailVerifiedAt').lean<any>();
    if (!u) throw new UnauthorizedException();
    const seller = u.role === 'SELLER' || u.role === 'CUSTOMER'
      ? await this.sellers.findOne({ user: u._id }).select('status slug storeName statusReason').lean()
      : null;
    return { ...u, id: String(u._id), seller };
  }

  async register(dto: z.infer<typeof RegisterDto>, res: Response) {
    const exists = await this.users.findOne({ $or: [{ email: dto.email.toLowerCase() }, { phone: dto.phone }] }).lean();
    if (exists) throw new ConflictException('Email or phone already registered');
    const verifyRaw = randomBytes(24).toString('hex');
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      locale: dto.locale,
      passwordHash: await argon2.hash(dto.password),
      verifyToken: sha(verifyRaw),
      verifySentAt: new Date(),
    });
    await this.sendVerify(user, verifyRaw);
    return this.issue(user, res);
  }

  private async sendVerify(user: any, raw: string) {
    await this.notify.notify(
      user._id,
      'WELCOME',
      { en: 'Welcome to OTD — verify your email', ar: 'مرحبًا بك في OTD — أكّد بريدك' },
      `/verify?token=${raw}`,
      {
        body: {
          en: `Hi ${user.name}, confirm your email to start shopping. The link expires in 48 hours.`,
          ar: `أهلًا ${user.name}، أكّد بريدك الإلكتروني لتبدأ التسوق. الرابط صالح لمدة ٤٨ ساعة.`,
        },
      },
    );
  }

  async login(dto: z.infer<typeof LoginDto>, res: Response) {
    const id = dto.identifier.trim().toLowerCase();
    const phone = id.replace(/[\s-]/g, '').replace(/^(\+20|0020)/, '0');
    const user = await this.users.findOne({ $or: [{ email: id }, { phone }] });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Wrong email/phone or password');
    }
    if (user.blockedAt) throw new ForbiddenException('This account is blocked');
    return this.issue(user, res);
  }

  async refresh(req: Request, res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException();
    let p: any;
    try {
      p = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.users.findById(p.sub);
    if (!user || user.blockedAt || user.refreshHash !== sha(p.r)) throw new UnauthorizedException();
    return this.issue(user, res);
  }

  async verify(token: string) {
    const r = await this.users.updateOne(
      { verifyToken: sha(token), verifySentAt: { $gt: addHours(new Date(), -48) } },
      { emailVerifiedAt: new Date(), $unset: { verifyToken: 1 } },
    );
    if (!r.modifiedCount) throw new BadRequestException('Link invalid or expired');
    return { ok: true };
  }

  async resendVerify(userId: string) {
    const u = await this.users.findById(userId);
    if (!u || u.emailVerifiedAt) return { ok: true };
    const raw = randomBytes(24).toString('hex');
    u.verifyToken = sha(raw);
    u.verifySentAt = new Date();
    await u.save();
    await this.sendVerify(u, raw);
    return { ok: true };
  }

  async forgot(email: string) {
    const u = await this.users.findOne({ email: email.toLowerCase() });
    if (u) {
      const raw = randomBytes(24).toString('hex');
      u.resetToken = sha(raw);
      u.resetExpires = addHours(new Date(), 1);
      await u.save();
      await this.notify.notify(u._id, 'PASSWORD_RESET', { en: 'Reset your password', ar: 'إعادة تعيين كلمة المرور' }, `/reset?token=${raw}`, {
        body: {
          en: 'Use the button below to choose a new password. The link expires in 1 hour.',
          ar: 'استخدم الزر بالأسفل لاختيار كلمة مرور جديدة. الرابط صالح لمدة ساعة.',
        },
      });
    }
    return { ok: true }; // never reveal whether the email exists
  }

  async reset(token: string, password: string) {
    const u = await this.users.findOne({ resetToken: sha(token), resetExpires: { $gt: new Date() } });
    if (!u) throw new BadRequestException('Link invalid or expired');
    u.passwordHash = await argon2.hash(password);
    u.resetToken = undefined;
    u.resetExpires = undefined;
    u.refreshHash = undefined; // sign out everywhere
    await u.save();
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = await this.users.findById(userId);
    if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, current))) throw new BadRequestException('Current password is wrong');
    u.passwordHash = await argon2.hash(next);
    await u.save();
    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body(new Zod(RegisterDto)) dto: z.infer<typeof RegisterDto>, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body(new Zod(LoginDto)) dto: z.infer<typeof LoginDto>, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, res);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** Hands out the CSRF token (the csrf middleware also sets it as the otd_csrf cookie). */
  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return { token: res.locals.csrfToken as string };
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u.id);
  }

  @Public()
  @HttpCode(200)
  @Post('verify')
  verify(@Body(new Zod(z.object({ token: z.string() }))) b: { token: string }) {
    return this.auth.verify(b.token);
  }

  @Post('resend-verify')
  resend(@CurrentUser() u: AuthUser) {
    return this.auth.resendVerify(u.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot')
  forgot(@Body(new Zod(z.object({ email: z.string().email() }))) b: { email: string }) {
    return this.auth.forgot(b.email);
  }

  @Public()
  @HttpCode(200)
  @Post('reset')
  reset(@Body(new Zod(z.object({ token: z.string(), password: z.string().min(8).max(100) }))) b: { token: string; password: string }) {
    return this.auth.reset(b.token, b.password);
  }

  @HttpCode(200)
  @Post('change-password')
  change(
    @CurrentUser() u: AuthUser,
    @Body(new Zod(z.object({ current: z.string(), next: z.string().min(8).max(100) }))) b: { current: string; next: string },
  ) {
    return this.auth.changePassword(u.id, b.current, b.next);
  }
}

@Module({ providers: [AuthService], controllers: [AuthController], exports: [AuthService] })
export class AuthModule {}
