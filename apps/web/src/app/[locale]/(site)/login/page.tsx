'use client';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, useAction } from '@/components/ui';
import { Link, useRouter } from '@/i18n/routing';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/store';

function LoginPageInner() {
  const t = useTranslations('auth');
  const { reload } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const { busy, error, run } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await post('/auth/login', { identifier, password });
      const me = await reload();
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      router.push(safeNext ?? (me?.role === 'ADMIN' ? '/admin' : me?.role === 'SELLER' ? '/seller' : '/account'));
    });
  };

  return (
    <AuthShell title={t('signInTitle')}>
      <form onSubmit={submit} className="space-y-7">
        <Field label={t('identifier')}><Input required value={identifier} onChange={(e) => setId(e.target.value)} autoComplete="username" /></Field>
        <Field label={t('password')}><Input required type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        <ErrorText error={error} />
        <Button size="lg" className="w-full" loading={busy}>{t('signIn')}</Button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot" className="text-muted underline underline-offset-4">{t('forgot')}</Link>
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="underline underline-offset-4">{t('register')}</Link>
        </div>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
