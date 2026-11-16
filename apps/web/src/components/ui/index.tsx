'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { upload } from '@/lib/api';
import { cx, money } from '@/lib/format';

/* ───────── Buttons ───────── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'solid' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'solid', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'label inline-flex items-center justify-center gap-2 transition-all duration-300 select-none disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'px-3 py-2',
        size === 'md' && 'px-6 py-3.5',
        size === 'lg' && 'px-8 py-4.5 text-xs',
        variant === 'solid' && 'bg-ink text-canvas hover:opacity-85',
        variant === 'outline' && 'border border-ink hover:bg-ink hover:text-canvas',
        variant === 'ghost' && 'underline-offset-4 hover:underline',
        variant === 'danger' && 'border border-danger text-danger hover:bg-danger hover:text-white',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});

export const Spinner = ({ className }: { className?: string }) => (
  <span className={cx('inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent', className)} />
);

/* ───────── Form fields ───────── */
export function Field({ label, hint, error, children, className }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label mb-2 block text-muted">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-danger">{error}</span>}
    </label>
  );
}

const fieldCls =
  'w-full border-0 border-b border-line bg-transparent px-0 py-2.5 text-[15px] outline-none transition-colors placeholder:text-subtle focus:border-ink disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(fieldCls, className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={4} className={cx(fieldCls, 'resize-y border border-line px-3', className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cx(fieldCls, 'cursor-pointer appearance-none bg-[length:10px] pe-6', className)} {...p}>
      {children}
    </select>
  );
});

export function Check({ label, checked, onChange, className }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-3 text-sm', className)}>
      <span className={cx('grid h-4 w-4 shrink-0 place-items-center border border-ink transition-colors', checked && 'bg-ink')}>
        {checked && <span className="h-1.5 w-1.5 bg-canvas" />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Radio({ label, desc, checked, onChange }: { label: React.ReactNode; desc?: React.ReactNode; checked: boolean; onChange: () => void }) {
  return (
    <label className={cx('flex cursor-pointer gap-4 border p-5 transition-colors', checked ? 'border-ink' : 'border-line hover:border-subtle')}>
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink">{checked && <span className="h-2 w-2 rounded-full bg-ink" />}</span>
      <input type="radio" className="sr-only" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {desc && <span className="mt-1 block text-sm text-muted">{desc}</span>}
      </span>
    </label>
  );
}

/** Paired English/Arabic input. */
export function I18nInput({ label, value, onChange, textarea, required }: { label: string; value: { en?: string; ar?: string } | undefined; onChange: (v: { en: string; ar: string }) => void; textarea?: boolean; required?: boolean }) {
  const v = { en: value?.en ?? '', ar: value?.ar ?? '' };
  const C: any = textarea ? Textarea : Input;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={`${label} · EN${required ? ' *' : ''}`}>
        <C dir="ltr" value={v.en} onChange={(e: any) => onChange({ ...v, en: e.target.value })} />
      </Field>
      <Field label={`${label} · ع`}>
        <C dir="rtl" value={v.ar} onChange={(e: any) => onChange({ ...v, ar: e.target.value })} />
      </Field>
    </div>
  );
}

/* ───────── Display ───────── */
export function Badge({ children, tone = 'default', className }: { children: React.ReactNode; tone?: 'default' | 'solid' | 'muted' | 'danger'; className?: string }) {
  return (
    <span
      className={cx(
        'label inline-flex items-center px-2 py-1 text-[10px] whitespace-nowrap',
        tone === 'default' && 'border border-ink',
        tone === 'solid' && 'bg-ink text-canvas',
        tone === 'muted' && 'bg-wash text-muted',
        tone === 'danger' && 'border border-danger text-danger',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Price({ price, original, className }: { price: number; original?: number; className?: string }) {
  const locale = useLocale();
  const sale = !!original && original > price;
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-2', className)}>
      <span className={cx(sale && 'font-medium')}>{money(price, locale)}</span>
      {sale && <span className="text-muted line-through">{money(original, locale)}</span>}
    </span>
  );
}

export function Stars({ value, size = 12, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          onClick={onChange ? () => onChange(i) : undefined}
          className={cx(onChange && 'cursor-pointer')}
          fill={i <= Math.round(value) ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7z" />
        </svg>
      ))}
    </span>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="border border-dashed border-line px-6 py-16 text-center text-muted">{children}</div>;

export function Notice({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'danger' }) {
  return <div className={cx('border px-4 py-3 text-sm', tone === 'danger' ? 'border-danger text-danger' : 'border-ink bg-wash')}>{children}</div>;
}

export function ErrorText({ error }: { error: any }) {
  if (!error) return null;
  return <p className="text-sm text-danger">{typeof error === 'string' ? error : error.message}</p>;
}

/* ───────── Overlays ───────── */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

export function Modal({ open, onClose, children, wide, title }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean; title?: React.ReactNode }) {
  const mounted = useMounted();
  useLockScroll(open);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cx('relative max-h-[92vh] w-full overflow-y-auto bg-canvas', wide ? 'max-w-5xl' : 'max-w-lg')}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            data-lenis-prevent
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-canvas px-6 pt-5 pb-3">
              <div className="font-display text-2xl">{title}</div>
              <button onClick={onClose} className="label hover:opacity-60" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, children, title, side = 'end' }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode; side?: 'start' | 'end' }) {
  const mounted = useMounted();
  const locale = useLocale();
  useLockScroll(open);
  if (!mounted) return null;
  const fromRight = (side === 'end') !== (locale === 'ar');
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.aside
            className={cx('absolute top-0 flex h-full w-full max-w-md flex-col bg-canvas', fromRight ? 'right-0' : 'left-0')}
            initial={{ x: fromRight ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: fromRight ? '100%' : '-100%' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            data-lenis-prevent
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-5">
              <div className="label">{title}</div>
              <button onClick={onClose} className="label hover:opacity-60" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────── Toast ───────── */
let pushToast: ((m: string) => void) | null = null;
export const toast = (m: string) => pushToast?.(m);
export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string }[]>([]);
  useEffect(() => {
    pushToast = (m) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, m }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="label bg-ink px-5 py-3 text-canvas">
            {t.m}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ───────── Uploads ───────── */
export function ImagesInput({ value, onChange, max = 12 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const t = useTranslations('common');
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, max - value.length)) urls.push((await upload(f, 'public')).url);
      onChange([...value, ...urls]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const move = (i: number, d: number) => {
    const n = [...value];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {value.map((src, i) => (
          <div key={src + i} className="group relative h-28 w-22 overflow-hidden bg-wash">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-canvas/90 px-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onClick={() => move(i, -1)}>‹</button>
              <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button>
              <button type="button" onClick={() => move(i, 1)}>›</button>
            </div>
            {i === 0 && <span className="absolute top-1 start-1 bg-ink px-1 text-[9px] text-canvas">1</span>}
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => ref.current?.click()} className="grid h-28 w-22 place-items-center border border-dashed border-subtle text-muted hover:border-ink">
            {busy ? <Spinner /> : '+'}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {busy && <p className="mt-2 text-xs text-muted">{t('uploading')}</p>}
      <ErrorText error={err} />
    </div>
  );
}

export function FileInput({ value, onChange, visibility = 'private', accept = 'image/jpeg,image/png,image/webp,application/pdf', label }: { value?: string; onChange: (url: string) => void; visibility?: 'public' | 'private'; accept?: string; label?: string }) {
  const t = useTranslations('common');
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      onChange((await upload(f, visibility)).url);
      setName(f.name);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} loading={busy}>
          {label ?? t('upload')}
        </Button>
        {value && (
          <a href={value} target="_blank" rel="noreferrer" className="truncate text-sm underline">
            {name || '✓'}
          </a>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      <ErrorText error={err} />
    </div>
  );
}

/* ───────── Data hook ───────── */
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Run an async action with a busy flag and error capture. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e: any) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

export function Loading() {
  const t = useTranslations('common');
  return (
    <div className="flex items-center gap-3 py-16 text-muted">
      <Spinner /> <span className="label">{t('loading')}</span>
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const t = useTranslations('common');
  if (pages <= 1) return null;
  return (
    <div className="mt-10 flex items-center justify-center gap-6">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('prev')}</Button>
      <span className="label text-muted">{t('page', { n: page, total: pages })}</span>
      <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('next')}</Button>
    </div>
  );
}

/** Prompt-for-reason dialog used by reject/cancel actions. */
export function ReasonDialog({ open, title, onClose, onSubmit, busy, error, cta }: { open: boolean; title: string; onClose: () => void; onSubmit: (reason: string) => void; busy?: boolean; error?: string | null; cta?: string }) {
  const t = useTranslations('common');
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Field label={t('reason')}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <ErrorText error={error} />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
        <Button loading={busy} disabled={reason.trim().length < 2} onClick={() => onSubmit(reason.trim())}>{cta ?? t('confirm')}</Button>
      </div>
    </Modal>
  );
}
