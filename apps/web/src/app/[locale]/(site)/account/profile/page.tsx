'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PageTitle } from '@/components/shop/PanelShell';
import { Button, ErrorText, Field, Input, Select, toast, useAction } from '@/components/ui';
import { usePathname, useRouter } from '@/i18n/routing';
import { patch, post } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function ProfilePage() {
  const t = useTranslations('account');
  const ta = useTranslations('auth');
  const tc = useTranslations('common');
  const { me, reload } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState({ name: '', phone: '', locale: 'en' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const save = useAction();
  const change = useAction();

  useEffect(() => {
    if (me) setF({ name: me.name, phone: me.phone ?? '', locale: me.locale || 'en' });
  }, [me]);

  return (
    <>
      <PageTitle>{t('profile')}</PageTitle>
      <div className="grid max-w-4xl gap-16 lg:grid-cols-2">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run(async () => {
              await patch('/account/profile', { name: f.name, phone: f.phone || undefined, locale: f.locale });
              await reload();
              toast(t('saved'));
              if (f.locale !== me?.locale) router.replace(pathname, { locale: f.locale as any });
            });
          }}
        >
          <Field label={ta('email')}><Input value={me?.email ?? ''} disabled /></Field>
          <Field label={ta('name')}><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={ta('phone')}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" dir="ltr" /></Field>
          <Field label={t('language')}>
            <Select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })}>
              <option value="en">{tc('english')}</option>
              <option value="ar">{tc('arabic')}</option>
            </Select>
          </Field>
          <ErrorText error={save.error} />
          <Button loading={save.busy}>{tc('save')}</Button>
        </form>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void change.run(async () => {
              await post('/auth/change-password', pw);
              setPw({ current: '', next: '' });
              toast(t('saved'));
            });
          }}
        >
          <p className="label">{t('changePassword')}</p>
          <Field label={t('currentPassword')}><Input type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={ta('newPassword')} hint={ta('passwordHint')}><Input type="password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <ErrorText error={change.error} />
          <Button variant="outline" loading={change.busy}>{t('changePassword')}</Button>
        </form>
      </div>
    </>
  );
}
