interface MarqueeProps {
  items: string[];
  /** Seconds for one full loop. */
  duration?: number;
}

/** Seamless marquee: the track holds the items twice and slides -50%. */
export function Marquee({ items, duration = 38 }: MarqueeProps) {
  const row = (ariaHidden: boolean) => (
    <div className="marquee-track items-center gap-10 pr-10" aria-hidden={ariaHidden || undefined}>
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="flex flex-none items-center gap-3 font-display text-lg font-semibold tracking-tight text-ink-faint"
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-mint" />
          {item}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="flex overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
        ['--marquee-duration' as string]: `${duration}s`,
      }}
    >
      {row(false)}
      {row(true)}
    </div>
  );
}
