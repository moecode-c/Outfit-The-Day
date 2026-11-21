import nodemailer, { Transporter } from 'nodemailer';

/** Email building and sending, free of Nest/Mongo so it can be unit-tested. */

/** Escapes text for HTML. */
export const escapeHtml = (s: string | number | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Email text is escaped (it often carries user-written reasons and names); only <b>…</b> survives,
 * which a few templates use for amounts.
 */
const safeText = (s: string) => escapeHtml(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>');

/** Minimal bilingual, monochrome email layout. */
export function emailLayout(locale: string, heading: string, body: string, cta?: { label: string; url: string }, footnote?: string) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html dir="${dir}"><body style="margin:0;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
<div style="font-family:Georgia,serif;font-size:32px;letter-spacing:-1px;margin-bottom:32px">OTD</div>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px">${safeText(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#404040">${safeText(body)}</div>
${cta ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;margin-top:28px;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:2px;text-transform:uppercase">${escapeHtml(cta.label)}</a>` : ''}
${footnote ? `<p style="margin-top:28px;font-size:12px;line-height:1.6;color:#737373">${safeText(footnote)}</p>` : ''}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:40px 0 16px"><div style="font-size:11px;color:#a3a3a3">Outfit The Day · Egypt</div>
</div></body></html>`;
}

/** "OTD <no-reply@otd.eg>" or "no-reply@otd.eg" → { name, email }. */
export function parseSender(from: string | undefined): { name?: string; email: string } {
  const raw = (from ?? '').trim() || 'OTD <no-reply@otd.eg>';
  const m = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (m) return { ...(m[1].trim() ? { name: m[1].trim() } : {}), email: m[2].trim() };
  return { email: raw };
}

/** Rough plain-text version of an email, for clients that do not render HTML (and for spam filters). */
export function htmlToText(html: string) {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
    .replace(/<(br|\/p|\/div|\/h1|hr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export type OutgoingMail = { to: string; subject: string; html: string; tags?: string[] };
/** Sends one email or throws. */
export type MailSender = { name: string; send: (m: OutgoingMail) => Promise<void> };

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Brevo transactional email API (https://developers.brevo.com/reference/sendtransacemail). */
export function brevoSender(apiKey: string, from: string | undefined, fetchImpl: typeof fetch = fetch): MailSender {
  const sender = parseSender(from);
  return {
    name: 'brevo',
    async send(m) {
      const res = await fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender,
          to: [{ email: m.to }],
          subject: m.subject,
          htmlContent: m.html,
          textContent: htmlToText(m.html),
          ...(m.tags?.length ? { tags: m.tags } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        let detail = '';
        try {
          const d = (await res.json()) as { code?: string; message?: string };
          detail = [d.code, d.message].filter(Boolean).join(': ');
        } catch {
          /* not JSON */
        }
        throw new Error(`Brevo ${res.status}${detail ? ` ${detail}` : ''}`);
      }
    },
  };
}

function smtpSender(env: NodeJS.ProcessEnv): MailSender {
  const transport: Transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const from = env.MAIL_FROM ?? 'OTD <no-reply@otd.eg>';
  return {
    name: 'smtp',
    async send(m) {
      await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: htmlToText(m.html) });
    },
  };
}

/** Brevo when BREVO_API_KEY is set, else SMTP when SMTP_HOST is set, else none (outbox only). */
export function senderFromEnv(env: NodeJS.ProcessEnv = process.env): MailSender | null {
  if (env.BREVO_API_KEY) return brevoSender(env.BREVO_API_KEY, env.MAIL_FROM);
  if (env.SMTP_HOST) return smtpSender(env);
  return null;
}
