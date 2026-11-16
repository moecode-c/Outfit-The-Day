'use client';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { cx } from '@/lib/format';
import { ProductCard } from './ProductCard';

/** Full-bleed hero image with slow parallax + scale-out on scroll. */
export function ParallaxHero({ image, children }: { image?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const scale = useTransform(scrollYProgress, [0, 1], [1.08, 1.2]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  return (
    <section ref={ref} className="relative h-[92svh] min-h-[560px] overflow-hidden bg-neutral-900">
      {image && (
        <motion.div style={{ y, scale }} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </motion.div>
      )}
      <motion.div style={{ opacity: fade }} className="relative flex h-full items-end px-4 pb-16 text-white md:px-10 md:pb-20">
        {children}
      </motion.div>
    </section>
  );
}

/** Image that reveals with a clip-path wipe when scrolled into view. */
export function RevealImage({ src, alt = '', className, ratio = 'aspect-[3/4]' }: { src?: string; alt?: string; className?: string; ratio?: string }) {
  return (
    <div className={cx('group relative overflow-hidden bg-wash', ratio, className)}>
      <motion.div
        className="absolute inset-0"
        initial={{ clipPath: 'inset(100% 0 0 0)' }}
        whileInView={{ clipPath: 'inset(0% 0 0 0)' }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 1.2, ease: [0.77, 0, 0.175, 1] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-105" />}
      </motion.div>
    </div>
  );
}

/** Horizontal, snap-scrolling product rail. */
export function Rail({ items }: { items: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => {
    const el = ref.current;
    if (!el) return;
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    el.scrollBy({ left: d * dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className="relative">
      <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 md:gap-5 md:px-10" data-lenis-prevent-wheel>
        {items.map((p) => (
          <div key={p._id} className="w-[46vw] shrink-0 snap-start md:w-[23vw] lg:w-[19vw]">
            <ProductCard p={p} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-6 px-4 md:px-10">
        <button className="label hover:opacity-60 rtl:rotate-180" onClick={() => scroll(-1)} aria-label="Previous">←</button>
        <button className="label hover:opacity-60 rtl:rotate-180" onClick={() => scroll(1)} aria-label="Next">→</button>
      </div>
    </div>
  );
}
