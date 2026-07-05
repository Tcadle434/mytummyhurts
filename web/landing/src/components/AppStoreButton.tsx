import { useState } from 'react';

import { APP_STORE_URL } from '../config';

interface AppStoreButtonProps {
  /** 'hero' renders the porcelain-on-evergreen variant. */
  variant: 'hero' | 'nav' | 'light';
}

const APPLE_LOGO = (
  <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

export function AppStoreButton({ variant }: AppStoreButtonProps) {
  const [showNote, setShowNote] = useState(false);
  const isLive = APP_STORE_URL.length > 0;

  const base =
    'inline-flex items-center gap-2.5 rounded-full font-semibold transition-transform duration-300 hover:scale-[1.04] active:scale-[0.98]';
  const styles = {
    hero: `${base} bg-canvas text-evergreen-deep px-8 py-4 text-base shadow-lift`,
    nav: `${base} bg-action text-canvas px-5 py-2.5 text-sm`,
    light: `${base} bg-evergreen text-canvas px-8 py-4 text-base shadow-lift`,
  } as const;

  if (isLive) {
    return (
      <a className={styles[variant]} href={APP_STORE_URL} target="_blank" rel="noreferrer">
        {APPLE_LOGO}
        Get it on the App Store
      </a>
    );
  }

  if (variant === 'nav') {
    return (
      <a className={styles.nav} href="#get">
        Get the app
      </a>
    );
  }

  return (
    <span className="inline-flex flex-col items-center gap-3 sm:items-start">
      <button type="button" className={styles[variant]} onClick={() => setShowNote(true)}>
        {APPLE_LOGO}
        Get it on the App Store
      </button>
      <span
        className={`text-sm transition-opacity duration-500 ${showNote ? 'opacity-100' : 'opacity-0'} ${
          variant === 'hero' ? 'text-on-hero-muted' : 'text-ink-soft'
        }`}
        aria-live="polite"
      >
        {showNote ? 'Almost there. The App Store listing goes live with launch.' : ' '}
      </span>
    </span>
  );
}
