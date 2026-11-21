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
import { emailLayout, NotifyService } from './notify';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** How long a password reset link works, and the minimum gap between two reset emails to one account. */
export const RESET_TTL_MINUTES = 60;
export const RESET_COOLDOWN_SECONDS = 60;
const zToken = z.string().regex(/^[a-f0-9]{48}$/, 'Invalid link');
const zPassword = z.string().min(8).max(100);
/** Signed-in devices kept per account; the oldest is signed out beyond this. */
export const MAX_SESSIONS = 10;

const RegisterDto = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: zEgPhone,
  password: zPassword,
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

  /**
   * Signs a device in: sets both cookies and records the refresh token. `replace` is the hash being
   * rotated out (refresh); `only` drops every other device (password change).
   */
  async issue(user: any, res: Response, opts: { replace?: string; only?: boolean } = {}) {
    const payload = { sub: String(user._id), role: user.role, perms: user.adminPerms ?? [], name: user.name, email: user.email };
    const access = this.jwt.sign(payload, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' });
    const refreshRaw = randomBytes(32).toString('hex');
    const refresh = this.jwt.sign({ sub: payload.sub, r: refreshRaw }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' });
    const hash = sha(refreshRaw);
    if (opts.only) {
      await this.users.updateOne({ _id: user._id }, { $set: { refreshHashes: [hash] } });
    } else {
      if (opts.replace) await this.users.updateOne({ _id: user._id }, { $pull: { refreshHashes: opts.replace } });
      await this.users.updateOne({ _id: user._id }, { $push: { refreshHashes: { $each: [hash], $slice: -MAX_SESSIONS } } });
    }
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
    const hash = sha(p.r);
    const user = await this.users.findOne({ _id: p.sub, refreshHashes: hash });
    if (!user || user.blockedAt) throw new UnauthorizedException();
    return this.issue(user, res, { replace: hash });
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

  /**
   * Emails a single-use reset link. Always answers the same way (and without waiting for the email
   * provider) so the response does not reveal whether an account exists.
   */
  async forgot(email: string) {
    const u = await this.users.findOne({ email: email.trim().toLowerCase() });
    const recently = u?.resetSentAt && Date.now() - new Date(u.resetSentAt).getTime() < RESET_COOLDOWN_SECONDS * 1000;
    if (u && !u.blockedAt && !recently) {
      const raw = randomBytes(24).toString('hex');
      u.resetToken = sha(raw);
      u.resetExpires = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
      u.resetSentAt = new Date();
      await u.save();
      void this.sendReset(u, raw).catch(() => undefined); // failures are recorded in the outbox
    }
    return { ok: true };
  }

  private async sendReset(u: any, raw: string) {
    const ar = u.locale === 'ar';
    const loc = ar ? 'ar' : 'en';
    const url = `${this.notify.webUrl}/${loc}/reset?token=${raw}`;
    const title = ar ? 'إعادة تعيين كلمة المرور' : 'Reset your password';
    const html = emailLayout(
      loc,
      title,
      ar
        ? `أهلًا ${u.name}، طلب أحدهم إعادة تعيين كلمة المرور لحسابك في OTD. اضغط الزر لاختيار كلمة مرور جديدة. الرابط صالح لمدة ساعة ويُستخدم مرة واحدة.`
        : `Hi ${u.name}, someone asked to reset the password for your OTD account. Use the button below to choose a new one. The link works once and expires in 1 hour.`,
      { label: ar ? 'اختيار كلمة مرور جديدة' : 'Choose a new password', url },
      ar
        ? `إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغير شيء. لا يعمل الزر؟ انسخ هذا الرابط: ${url}`
        : `If you didn't ask for this, ignore this email and nothing will change. Button not working? Copy this link: ${url}`,
    );
    await this.notify.mail(u.email, `OTD · ${title}`, html, { sensitive: true, tags: ['password-reset'] });
  }

  /** Lets the reset page say "this link has expired" before the user types a new password. */
  async checkReset(token: string) {
    const ok = await this.users.exists({ resetToken: sha(token), resetExpires: { $gt: new Date() } });
    return { valid: Boolean(ok) };
  }

  async reset(token: string, password: string) {
    const passwordHash = await argon2.hash(password);
    // Consume the token atomically so the same link cannot be used twice.
    const u = await this.users.findOneAndUpdate(
      { resetToken: sha(token), resetExpires: { $gt: new Date() } },
      // Emptying refreshHashes signs the account out everywhere.
      { $set: { passwordHash, passwordChangedAt: new Date(), refreshHashes: [] }, $unset: { resetToken: 1, resetExpires: 1 } },
      { new: true },
    );
    if (!u) throw new BadRequestException('This link is invalid or has expired. Request a new one.');
    // The link arrived by email, so the address is proven.
    if (!u.emailVerifiedAt) await this.users.updateOne({ _id: u._id }, { emailVerifiedAt: new Date(), $unset: { verifyToken: 1 } });
    void this.sendPasswordChanged(u).catch(() => undefined);
    return { ok: true };
  }

  private async sendPasswordChanged(u: any) {
    const ar = u.locale === 'ar';
    const loc = ar ? 'ar' : 'en';
    const title = ar ? 'تم تغيير كلمة المرور' : 'Your password was changed';
    const html = emailLayout(
      loc,
      title,
      ar
        ? `أهلًا ${u.name}، تم تغيير كلمة مرور حسابك في OTD وتسجيل خروجك من جميع الأجهزة الأخرى. إذا لم تقم بذلك، أعد تعيين كلمة المرور فورًا وتواصل معنا.`
        : `Hi ${u.name}, the password for your OTD account was just changed and your other devices were signed out. If this wasn't you, reset your password right away and contact us.`,
      { label: ar ? 'تسجيل الدخول' : 'Sign in', url: `${this.notify.webUrl}/${loc}/login` },
    );
    await this.notify.mail(u.email, `OTD · ${title}`, html, { tags: ['password-changed'] });
  }

  /** Changes the password, signs out other devices and keeps this one signed in. */
  async changePassword(userId: string, current: string, next: string, res: Response) {
    const u = await this.users.findById(userId);
    if (!u?.passwordHash || !(await argon2.verify(u.passwordHash, current))) throw new BadRequestException('Current password is wrong');
    u.passwordHash = await argon2.hash(next);
    u.passwordChangedAt = new Date();
    await u.save();
    await this.issue(u, res, { only: true }); // every other device's refresh token stops working
    void this.sendPasswordChanged(u).catch(() => undefined);
    return { ok: true };
  }

  /** Ends the session server-side too, so a copied refresh cookie stops working. */
  async logout(req: Request, res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      try {
        const p: any = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET });
        await this.users.updateOne({ _id: p.sub }, { $pull: { refreshHashes: sha(p.r) } });
      } catch {
        /* expired or forged: nothing to revoke */
      }
    }
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
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
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
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
  forgot(@Body(new Zod(z.object({ email: z.string().trim().email().max(200) }))) b: { email: string }) {
    return this.auth.forgot(b.email);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset/check')
  checkReset(@Body(new Zod(z.object({ token: z.string().max(200) }))) b: { token: string }) {
    if (!zToken.safeParse(b.token).success) return { valid: false };
    return this.auth.checkReset(b.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset')
  reset(@Body(new Zod(z.object({ token: zToken, password: zPassword }))) b: { token: string; password: string }) {
    return this.auth.reset(b.token, b.password);
  }

  @HttpCode(200)
  @Post('change-password')
  change(
    @CurrentUser() u: AuthUser,
    @Body(new Zod(z.object({ current: z.string(), next: zPassword }))) b: { current: string; next: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.changePassword(u.id, b.current, b.next, res);
  }
}

@Module({ providers: [AuthService], controllers: [AuthController], exports: [AuthService] })
export class AuthModule {}
