'use client';
import { Suspense } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, useAction } from '@/components/ui';
import { Link, useRouter } from '@/i18n/routing';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/store';

function RegisterPageInner() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const { reload } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await post('/auth/register', { ...f, locale });
      await reload();
      router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
    });
  };

  return (
    <AuthShell title={t('registerTitle')}>
      <form onSubmit={submit} className="space-y-7">
        <Field label={t('name')}><Input required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label={t('email')}><Input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label={t('phone')}><Input required value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="01xxxxxxxxx" autoComplete="tel" /></Field>
        <Field label={t('password')} hint={t('passwordHint')}><Input required minLength={8} type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <ErrorText error={error} />
        <Button size="lg" className="w-full" loading={busy}>{t('register')}</Button>
        <p className="text-sm text-muted">{t('haveAccount')} <Link href="/login" className="text-ink underline underline-offset-4">{t('signIn')}</Link></p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}
