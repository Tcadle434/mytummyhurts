import { Pip } from '../components/Pip';
import { Reveal } from '../motion/Reveal';
import { useCountUp } from '../motion/useCountUp';

const SCORE = 78;
const RING_CIRCUMFERENCE = 2 * Math.PI * 84;

export function GutScorePillar() {
  const { ref, value } = useCountUp(SCORE);

  return (
    <section id="score" className="noise relative overflow-hidden bg-evergreen py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="glow-a pointer-events-none absolute -right-[10%] -top-[25%] h-[70vh] w-[70vh] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(150,200,174,0.35), transparent 65%)', filter: 'blur(44px)' }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <Reveal className="order-2 lg:order-1">
          <div className="relative mx-auto flex h-[300px] w-[300px] items-center justify-center sm:h-[340px] sm:w-[340px]">
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
              <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(247,246,242,0.12)" strokeWidth="10" />
              <circle
                cx="100"
                cy="100"
                r="84"
                fill="none"
                stroke="#96C8AE"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(value / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                ref={ref as never}
                className="font-display text-[88px] font-extrabold leading-none tracking-tight text-on-hero"
              >
                {value}
              </span>
              <span className="mt-1 font-display text-lg font-bold text-mint">calmer</span>
              <span className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-on-hero">
                Up 9 this week
              </span>
            </div>
            <div className="bob absolute -bottom-3 -right-4">
              <Pip pose="joy" size={124} />
            </div>
          </div>
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">Gut Score</p>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-on-hero sm:text-5xl">
              One number for how your gut is doing.
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-md text-base leading-relaxed text-on-hero-muted sm:text-lg">
              Your last two weeks, read honestly: calm, mixed, or rough. Higher score = calmer gut.
              Watch it climb as the app finds what actually works for you.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {[
                { word: 'rough', className: 'bg-confirmed-bg text-confirmed-fg' },
                { word: 'mixed', className: 'bg-suspect-bg text-suspect-fg' },
                { word: 'calm', className: 'bg-cleared-bg text-cleared-fg' },
              ].map((band) => (
                <span
                  key={band.word}
                  className={`rounded-full px-4 py-1.5 font-display text-sm font-bold ${band.className}`}
                >
                  {band.word}
                </span>
              ))}
            </div>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-on-hero-faint">
              Not a wellness grade, not a guilt trip. Just the trend of your own reports, so you can
              tell whether the last two weeks are actually getting better.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
