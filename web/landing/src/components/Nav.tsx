import { useEffect, useState } from 'react';

import { AppStoreButton } from './AppStoreButton';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#score', label: 'Gut Score' },
  { href: '#triggers', label: 'Triggers' },
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled ? 'bg-evergreen-deep/85 backdrop-blur-md shadow-modal' : 'bg-transparent'
      }`}
    >
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="/" className="font-display text-lg font-bold tracking-tight text-on-hero">
          MyTummyHurts
        </a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-on-hero-muted transition-colors hover:text-on-hero"
            >
              {link.label}
            </a>
          ))}
        </div>
        <AppStoreButton variant="nav" />
      </nav>
    </header>
  );
}
