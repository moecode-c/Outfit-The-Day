'use client';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/shop/AuthShell';
import { Loading, Notice } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/store';

function VerifyPageInner() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') ?? '';
  const { reload } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const started = useRef(false);
  useEffect(() => {
    // Tokens are single-use: guard against the dev double-invoke.
    if (started.current) return;
    started.current = true;
    post('/auth/verify', { token })
      .then(() => {
        setState('ok');
        void reload();
      })
      .catch(() => setState('fail'));
  }, [token, reload]);
  return (
    <AuthShell title={t('verifyTitle')}>
      {state === 'loading' ? <Loading /> : <Notice tone={state === 'fail' ? 'danger' : 'default'}>{state === 'ok' ? t('verified') : t('verifyFailed')}</Notice>}
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyPageInner />
    </Suspense>
  );
}
