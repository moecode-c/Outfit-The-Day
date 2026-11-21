'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, del, post, put } from './api';

/* ───────── Auth ───────── */
export type Me = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'CUSTOMER' | 'SELLER' | 'ADMIN';
  adminPerms: string[];
  locale: string;
  emailVerifiedAt?: string;
  seller?: { status: string; slug: string; storeName: any; statusReason?: string } | null;
};

type AuthCtx = { me: Me | null; loading: boolean; reload: () => Promise<Me | null>; logout: () => Promise<void> };
const AuthContext = createContext<AuthCtx>({ me: null, loading: true, reload: async () => null, logout: async () => {} });

/* ───────── Bag ───────── */
export type BagItem = { product: string; variant: string; qty: number };
type BagCtx = {
  items: BagItem[];
  count: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (i: BagItem) => void;
  setQty: (variant: string, qty: number) => void;
  remove: (variant: string) => void;
  clear: () => void;
};
const BagContext = createContext<BagCtx>(null as any);

/* ───────── Wishlist ───────── */
type WishCtx = { ids: Set<string>; toggle: (id: string) => Promise<boolean> };
const WishContext = createContext<WishCtx>({ ids: new Set(), toggle: async () => false });

const BAG_KEY = 'otd-bag';
const readBag = (): BagItem[] => {
  try {
    return JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
  } catch {
    return [];
  }
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BagItem[]>([]);
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState<Set<string>>(new Set());
  const syncing = useRef(false); // merge with the server bag started
  const synced = useRef(false); // ...and finished: only then is the bag saved back

  const reload = useCallback(async () => {
    try {
      const m = await api<Me>('/auth/me');
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setItems(readBag());
    void reload();
  }, [reload]);

  // On login: merge the guest bag with the saved server bag, load wishlist.
  useEffect(() => {
    if (!me) {
      syncing.current = false;
      synced.current = false;
      setWish(new Set());
      return;
    }
    if (syncing.current) return;
    syncing.current = true;
    (async () => {
      try {
        const server = await api<BagItem[]>('/account/cart');
        setItems((local) => {
          const merged = [...server];
          for (const l of local) {
            const s = merged.find((x) => x.variant === l.variant);
            if (s) s.qty = Math.max(s.qty, l.qty);
            else merged.push(l);
          }
          return merged;
        });
      } catch {}
      // Saving before the merge would overwrite the saved server bag with the guest bag.
      synced.current = true;
      try {
        setWish(new Set(await api<string[]>('/account/wishlist/ids')));
      } catch {}
    })();
  }, [me]);

  // Persist bag locally and (debounced) on the server for logged-in users.
  useEffect(() => {
    try {
      localStorage.setItem(BAG_KEY, JSON.stringify(items));
    } catch {}
    if (!me || !synced.current) return;
    const t = setTimeout(() => put('/account/cart', { items }).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [items, me]);

  const bag = useMemo<BagCtx>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.qty, 0),
      open,
      setOpen,
      add: (i) =>
        setItems((cur) => {
          const ex = cur.find((x) => x.variant === i.variant);
          if (ex) return cur.map((x) => (x.variant === i.variant ? { ...x, qty: Math.min(20, x.qty + i.qty) } : x));
          return [...cur, i];
        }),
      setQty: (variant, qty) => setItems((cur) => cur.map((x) => (x.variant === variant ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x))),
      remove: (variant) => setItems((cur) => cur.filter((x) => x.variant !== variant)),
      clear: () => setItems([]),
    }),
    [items, open],
  );

  const wishCtx = useMemo<WishCtx>(
    () => ({
      ids: wish,
      toggle: async (id) => {
        if (!me) return false;
        const has = wish.has(id);
        setWish((s) => {
          const n = new Set(s);
          if (has) n.delete(id);
          else n.add(id);
          return n;
        });
        try {
          if (has) await del(`/account/wishlist/${id}`);
          else await post(`/account/wishlist/${id}`);
        } catch {}
        return true;
      },
    }),
    [wish, me],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    setMe(null);
    setItems([]);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, reload, logout }}>
      <BagContext.Provider value={bag}>
        <WishContext.Provider value={wishCtx}>{children}</WishContext.Provider>
      </BagContext.Provider>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export const useBag = () => useContext(BagContext);
export const useWish = () => useContext(WishContext);
