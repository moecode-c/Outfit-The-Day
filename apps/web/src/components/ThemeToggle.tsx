'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) || 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('otd-theme', next);
    } catch {}
    setTheme(next);
  };

  return (
    <button onClick={toggle} className="label transition-opacity hover:opacity-60" aria-label="Toggle theme">
      {theme === 'light' ? t('dark') : t('light')}
    </button>
  );
}
