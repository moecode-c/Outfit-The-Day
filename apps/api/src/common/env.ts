/**
 * Start-up configuration checks. In production a weak or missing setting stops the API from
 * booting (better than running with a guessable JWT secret); in development they are warnings.
 */
const PLACEHOLDERS = /^(change-?me|secret|changeme|password|test|dev)/i;

export type EnvReport = { errors: string[]; warnings: string[] };

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const prod = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];
  const problem = (msg: string) => (prod ? errors : warnings).push(msg);

  if (!env.MONGODB_URI) problem('MONGODB_URI is not set');
  else if (prod && /localhost|127\.0\.0\.1/.test(env.MONGODB_URI)) errors.push('MONGODB_URI points at localhost in production');

  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = env[k];
    if (!v) problem(`${k} is not set`);
    else if (v.length < 32 || PLACEHOLDERS.test(v)) problem(`${k} must be a random value of at least 32 characters (try: openssl rand -hex 32)`);
  }
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) problem('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');

  if (prod) {
    if (!env.WEB_ORIGIN?.startsWith('https://')) errors.push('WEB_ORIGIN must be the https:// address of the web app');
    if (env.THROTTLE_DISABLED === 'true') warnings.push('THROTTLE_DISABLED is ignored in production');
    // Railway/Render disks are wiped on every deploy, so uploads would silently disappear.
    if (!env.R2_BUCKET && env.ALLOW_DISK_UPLOADS !== 'true') errors.push('R2_BUCKET (and the other R2_* settings) must be set in production, or set ALLOW_DISK_UPLOADS=true for a persistent disk');
    if (!env.BREVO_API_KEY && !env.SMTP_HOST) warnings.push('No email provider (BREVO_API_KEY or SMTP_HOST): emails, including password resets, will only be stored in the admin outbox');
  }
  // Brevo only accepts a sender address verified in the Brevo account.
  if (env.BREVO_API_KEY && !env.MAIL_FROM) problem('MAIL_FROM must be set to a sender verified in Brevo, e.g. "OTD <no-reply@your-domain>"');
  return { errors, warnings };
}

/** Logs warnings and throws on errors. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env, log: Pick<Console, 'warn'> = console) {
  const { errors, warnings } = checkEnv(env);
  for (const w of warnings) log.warn(`[config] ${w}`);
  if (errors.length) throw new Error(`Invalid production configuration:\n  - ${errors.join('\n  - ')}`);
}
