'use client';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, Notice, useAction } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { post } from '@/lib/api';

function ResetPageInner() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') ?? '';
  const [password, setPw] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <AuthShell title={t('resetTitle')}>
      {done ? (
        <div className="space-y-6">
          <Notice>{t('resetDone')}</Notice>
          <Link href="/login" className="label underline underline-offset-8">{t('signIn')}</Link>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await post('/auth/reset', { token, password }); setDone(true); }); }} className="space-y-7">
          <Field label={t('newPassword')} hint={t('passwordHint')}><Input required minLength={8} type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <ErrorText error={error} />
          <Button size="lg" className="w-full" loading={busy}>{t('resetTitle')}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetPageInner />
    </Suspense>
  );
}
