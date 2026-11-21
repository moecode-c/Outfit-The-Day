'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, Notice, useAction } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { post } from '@/lib/api';

export default function ForgotPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    void run(async () => {
      await post('/auth/forgot', { email: value });
      setSentTo(value);
    });
  };

  return (
    <AuthShell title={t('forgotTitle')}>
      {sentTo ? (
        <div className="space-y-6" data-testid="forgot-sent">
          <Notice>{t('linkSent', { email: sentTo })}</Notice>
          <p className="text-sm text-muted">{t('checkSpam')}</p>
          <div className="flex justify-between text-sm">
            <Link href="/login" className="underline underline-offset-4">{t('backToSignIn')}</Link>
            <button type="button" className="text-muted underline underline-offset-4" onClick={() => setSentTo(null)}>{t('tryAgain')}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-7">
          <p className="text-muted">{t('forgotText')}</p>
          <Field label={t('email')}>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </Field>
          <ErrorText error={error} />
          <Button size="lg" className="w-full" loading={busy}>{t('sendLink')}</Button>
          <div className="text-sm">
            <Link href="/login" className="text-muted underline underline-offset-4">{t('backToSignIn')}</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
