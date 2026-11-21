import { Controller, Get, Global, Injectable, Logger, Module, Param, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser, CurrentUser } from '../common/auth';
import { emailLayout, MailSender, senderFromEnv } from '../common/mail';

export { emailLayout };

type T = { en: string; ar: string };

const REDACTED = '<p>(Content hidden: this email contained a private account link.)</p>';

@Injectable()
export class NotifyService {
  private readonly log = new Logger('Mail');
  private sender: MailSender | null = senderFromEnv();

  constructor(
    @InjectModel('Notification') private readonly notifications: Model<any>,
    @InjectModel('Mail') private readonly mails: Model<any>,
    @InjectModel('User') private readonly users: Model<any>,
  ) {
    this.log.log(this.sender ? `Sending email with ${this.sender.name}` : 'No email provider configured: emails go to the admin outbox only');
  }

  /** Tests only. */
  setSender(s: MailSender | null) {
    this.sender = s;
  }

  get webUrl() {
    return (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  /**
   * Raw email, recorded in the outbox. Without a provider it stays there (viewable by admins).
   * `sensitive` emails (password reset links) are stored redacted so the outbox cannot be used to
   * take over accounts; the full copy is kept only in development when no provider is configured.
   * Returns true when the provider accepted it.
   */
  async mail(to: string, subject: string, html: string, opts: { sensitive?: boolean; tags?: string[] } = {}): Promise<boolean> {
    const keepFull = !opts.sensitive || (!this.sender && process.env.NODE_ENV !== 'production');
    const doc = await this.mails.create({ to, subject, html: keepFull ? html : REDACTED, sent: false });
    if (!this.sender) {
      this.log.log(`[outbox] ${to} · ${subject}`);
      return false;
    }
    try {
      await this.sender.send({ to, subject, html, tags: opts.tags });
      await this.mails.updateOne({ _id: doc._id }, { sent: true });
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      this.log.error(`Could not send "${subject}" to ${to}: ${msg}`);
      await this.mails.updateOne({ _id: doc._id }, { error: msg });
      return false;
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
