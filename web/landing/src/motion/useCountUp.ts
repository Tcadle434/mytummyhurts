import { useEffect, useRef, useState } from 'react';

const COUNT_DURATION_MS = 1400;

/**
 * Counts from 0 to target once the returned ref scrolls into view.
 * Respects prefers-reduced-motion by jumping straight to the target.
 * SSR renders the final value so no-JS readers see the real number.
 */
export function useCountUp(target: number) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(target);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / COUNT_DURATION_MS, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };
        setValue(0);
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);

  return { ref, value };
}
