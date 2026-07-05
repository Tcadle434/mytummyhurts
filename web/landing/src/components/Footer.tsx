export function Footer() {
  return (
    <footer className="bg-evergreen-deep noise">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-xl font-bold text-on-hero">MyTummyHurts</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-on-hero-faint">
            Know how it will sit before you eat it. Made for the bloated, the curious, and the
            chronically gut-tired.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-sm text-on-hero-muted sm:flex-row sm:gap-8">
          <a href="/privacy.html" className="transition-colors hover:text-on-hero">
            Privacy
          </a>
          <a href="/terms.html" className="transition-colors hover:text-on-hero">
            Terms
          </a>
          <a href="#faq" className="transition-colors hover:text-on-hero">
            FAQ
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 sm:px-8">
        <p className="border-t border-white/10 pt-6 text-xs text-on-hero-faint">
          © 2026 MyTummyHurts. Built for iPhone. Not a medical device.
        </p>
      </div>
    </footer>
  );
}
