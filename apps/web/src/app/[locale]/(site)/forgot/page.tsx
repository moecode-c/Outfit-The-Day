'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, Notice, useAction } from '@/components/ui';
import { post } from '@/lib/api';

export default function ForgotPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <AuthShell title={t('forgotTitle')}>
      {sent ? (
        <Notice>{t('linkSent')}</Notice>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await post('/auth/forgot', { email }); setSent(true); }); }} className="space-y-7">
          <p className="text-muted">{t('forgotText')}</p>
          <Field label={t('email')}><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <ErrorText error={error} />
          <Button size="lg" className="w-full" loading={busy}>{t('sendLink')}</Button>
        </form>
      )}
    </AuthShell>
  );
}
