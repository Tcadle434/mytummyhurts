import { useEffect, useState } from 'react';

import { AppStoreButton } from '../components/AppStoreButton';
import { PhoneMock, SCREEN_ORDER, type ScreenKey } from '../components/PhoneMock';
import { Pip } from '../components/Pip';

const CYCLE_MS = 5200;

const TRUST_CHIPS = ['7 days free', 'Private by default', 'Not a medical device'];

export function Hero() {
  const [active, setActive] = useState<ScreenKey>('scan');
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      setActive((current) => {
        const index = SCREEN_ORDER.findIndex((s) => s.key === current);
        const next = SCREEN_ORDER[(index + 1) % SCREEN_ORDER.length];
        return next ? next.key : current;
      });
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <section className="noise relative overflow-hidden bg-evergreen-deep">
      {/* Ambient garden glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="glow-a absolute -left-[15%] -top-[20%] h-[70vh] w-[70vh] rounded-full opacity-45"
          style={{ background: 'radial-gradient(circle, rgba(150,200,174,0.5), transparent 65%)', filter: 'blur(40px)' }}
        />
        <div
          className="glow-b absolute -right-[10%] top-[30%] h-[60vh] w-[60vh] rounded-full opacity-35"
          style={{ background: 'radial-gradient(circle, rgba(253,163,139,0.4), transparent 65%)', filter: 'blur(48px)' }}
        />
        <div
          className="absolute -bottom-[30%] left-[20%] h-[60vh] w-[80vh] rounded-full opacity-50"
          style={{ background: 'radial-gradient(circle, rgba(27,90,64,0.9), transparent 70%)', filter: 'blur(30px)' }}
        />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-14 px-5 pb-16 pt-28 sm:px-8 lg:flex-row lg:items-center lg:gap-10 lg:pb-12 lg:pt-24">
        {/* Copy column */}
        <div className="max-w-xl text-center lg:max-w-[660px] lg:text-left">
          <p className="fade-rise inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-mint">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
            For IBS, reflux, lactose and gluten
          </p>
          <h1 className="fade-rise-1 mt-6 font-display text-[42px] font-extrabold leading-[1.04] tracking-tight text-on-hero sm:text-6xl lg:text-[62px]">
            Know how it will sit <br className="hidden lg:inline" /><span className="text-mint">before you eat{' '}it.</span>
          </h1>
          <p className="fade-rise-2 mx-auto mt-6 max-w-md text-base leading-relaxed text-on-hero-muted sm:text-lg lg:mx-0">
            Point your camera at a meal or a menu. MyTummyHurts reads it against your own calm and
            rough days and gives you an honest read in seconds.
          </p>
          <div className="fade-rise-3 mt-9 flex flex-col items-center gap-4 sm:flex-row lg:items-start">
            <AppStoreButton variant="hero" />
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full px-6 py-4 text-base font-semibold text-on-hero-muted transition-colors hover:text-on-hero"
            >
              See how it works
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14m0 0l-6-6m6 6l6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <ul className="fade-rise-4 mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 lg:justify-start">
            {TRUST_CHIPS.map((chip) => (
              <li key={chip} className="flex items-center gap-1.5 text-sm text-on-hero-faint">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#96C8AE" strokeWidth="3" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {chip}
              </li>
            ))}
          </ul>
        </div>

        {/* Product column */}
        <div
          className="fade-rise-4 relative flex flex-col items-center gap-4 lg:ml-auto"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Oversized faint ring behind the phone */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.07]"
          />
          <div className="bob relative">
            <div className="absolute -right-9 -top-14 z-10 -scale-x-100">
              <Pip pose="waving" size={104} eager alt="Pip the stomach mascot waving over the phone" />
            </div>
            <PhoneMock active={active} />
          </div>
          <div className="flex items-center gap-2" role="tablist" aria-label="App screens">
            {SCREEN_ORDER.map((screen, index) => (
              <button
                key={screen.key}
                type="button"
                role="tab"
                aria-selected={active === screen.key}
                onClick={() => {
                  setActive(screen.key);
                  setPaused(true);
                }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 ${
                  active === screen.key
                    ? 'bg-white/15 text-on-hero'
                    : 'text-on-hero-faint hover:text-on-hero-muted'
                }`}
              >
                {String(index + 1).padStart(2, '0')} · {screen.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
