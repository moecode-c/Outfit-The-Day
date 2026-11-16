import { Controller, Get, Global, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import nodemailer, { Transporter } from 'nodemailer';
import { AuthUser, CurrentUser } from '../common/auth';

type T = { en: string; ar: string };

/** Minimal bilingual, monochrome email layout. */
export function emailLayout(locale: string, heading: string, body: string, cta?: { label: string; url: string }) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html dir="${dir}"><body style="margin:0;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
<div style="font-family:Georgia,serif;font-size:32px;letter-spacing:-1px;margin-bottom:32px">OTD</div>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px">${heading}</h1>
<div style="font-size:15px;line-height:1.6;color:#404040">${body}</div>
${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:28px;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:2px;text-transform:uppercase">${cta.label}</a>` : ''}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:40px 0 16px"><div style="font-size:11px;color:#a3a3a3">Outfit The Day · Egypt</div>
</div></body></html>`;
}

@Injectable()
export class NotifyService {
  private readonly log = new Logger('Mail');
  private transport: Transporter | null = null;

  constructor(
    @InjectModel('Notification') private readonly notifications: Model<any>,
    @InjectModel('Mail') private readonly mails: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
  ) {
    if (process.env.SMTP_HOST) {
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
  }

  get webUrl() {
    return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  }

  /** Raw email. Without SMTP configured it is kept in the outbox (viewable by admin). */
  async mail(to: string, subject: string, html: string) {
    const doc = await this.mails.create({ to, subject, html, sent: false });
    if (!this.transport) {
      this.log.log(`[outbox] ${to} · ${subject}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: process.env.MAIL_FROM ?? 'OTD <no-reply@otd.eg>', to, subject, html });
      await this.mails.updateOne({ _id: doc._id }, { sent: true });
    } catch (e) {
      await this.mails.updateOne({ _id: doc._id }, { error: (e as Error).message });
    }
  }

  /** In-site notification + optional email in the user's language. */
  async notify(userId: any, type: string, title: T, link?: string, email?: { body: T }) {
    if (!userId) return;
    await this.notifications.create({ user: userId, type, title, link });
    if (!email) return;
    const u = await this.users.findById(userId).lean<any>();
    if (!u) return;
    const loc = u.locale === 'ar' ? 'ar' : 'en';
    const url = link ? `${this.webUrl}/${loc}${link}` : undefined;
    await this.mail(
      u.email,
      `OTD · ${title[loc]}`,
      emailLayout(loc, title[loc], email.body[loc], url ? { label: loc === 'ar' ? 'عرض' : 'View', url } : undefined),
    );
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(@InjectModel('Notification') private readonly notifications: Model<any>) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.notifications.find({ user: u.id }).sort({ createdAt: -1 }).limit(50).lean(),
      this.notifications.countDocuments({ user: u.id, readAt: null }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  async readAll(@CurrentUser() u: AuthUser) {
    await this.notifications.updateMany({ user: u.id, readAt: null }, { readAt: new Date() });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.notifications.updateOne({ _id: id, user: u.id }, { readAt: new Date() });
    return { ok: true };
  }
}

@Global()
@Module({ providers: [NotifyService], controllers: [NotificationsController], exports: [NotifyService] })
export class NotifyModule {}
