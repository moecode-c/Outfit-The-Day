'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/store';

export function VerifyBanner() {
  const t = useTranslations('auth');
  const { me } = useAuth();
  const [sent, setSent] = useState(false);
  if (!me || me.emailVerifiedAt) return null;
  return (
    <div className="flex items-center justify-center gap-4 bg-wash px-4 py-2.5 text-xs">
      <span>{t('verifyBanner')}</span>
      <button className="label underline underline-offset-4" disabled={sent} onClick={() => post('/auth/resend-verify').then(() => setSent(true))}>
        {sent ? t('resent') : t('resend')}
      </button>
    </div>
  );
}
