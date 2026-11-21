'use client';
import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/shop/AuthShell';
import { Button, ErrorText, Field, Input, Notice, Spinner, useAction } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { post } from '@/lib/api';

type State = 'checking' | 'invalid' | 'ready' | 'done';

function ResetPageInner() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>(token ? 'checking' : 'invalid');
  const [password, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!token) return setState('invalid');
    let alive = true;
    setState('checking');
    post<{ valid: boolean }>('/auth/reset/check', { token })
      .then((r) => alive && setState(r.valid ? 'ready' : 'invalid'))
      .catch(() => alive && setState('ready')); // network hiccup: let the submit report the real error
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setMismatch(true);
    setMismatch(false);
    void run(async () => {
      await post('/auth/reset', { token, password });
      setState('done');
    });
  };

  if (state === 'checking') {
    return (
      <AuthShell title={t('resetTitle')}>
        <p className="flex items-center gap-3 text-muted" role="status"><Spinner /> {t('resetChecking')}</p>
      </AuthShell>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthShell title={t('resetTitle')}>
        <div className="space-y-6" data-testid="reset-invalid">
          <Notice tone="danger">{t('resetInvalid')}</Notice>
          <Link href="/forgot" className="label inline-block underline underline-offset-8">{t('requestNewLink')}</Link>
        </div>
      </AuthShell>
    );
  }

  if (state === 'done') {
    return (
      <AuthShell title={t('resetTitle')}>
        <div className="space-y-6" data-testid="reset-done">
          <Notice>{t('resetDone')}</Notice>
          <Link href="/login" className="label inline-block underline underline-offset-8">{t('signIn')}</Link>
        </div>
      </AuthShell>
    );
  }

  const type = show ? 'text' : 'password';
  return (
    <AuthShell title={t('resetTitle')}>
      <form onSubmit={submit} className="space-y-7">
        <Field label={t('newPassword')} hint={t('passwordHint')}>
          <div className="relative">
            <Input required minLength={8} maxLength={100} type={type} value={password} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus className="pe-14" />
            <button type="button" onClick={() => setShow((s) => !s)} className="label absolute end-0 top-1/2 -translate-y-1/2 text-muted" aria-pressed={show}>
              {show ? t('hidePassword') : t('showPassword')}
            </button>
          </div>
        </Field>
        <Field label={t('confirmPassword')} error={mismatch ? t('passwordsDontMatch') : null}>
          <Input required minLength={8} maxLength={100} type={type} value={confirm} onChange={(e) => { setConfirm(e.target.value); setMismatch(false); }} autoComplete="new-password" />
        </Field>
        <ErrorText error={error} />
        <Button size="lg" className="w-full" loading={busy}>{t('resetTitle')}</Button>
        {error && (
          <Link href="/forgot" className="block text-sm text-muted underline underline-offset-4">{t('requestNewLink')}</Link>
        )}
      </form>
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
