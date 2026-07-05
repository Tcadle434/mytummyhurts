import { Marquee } from '../components/Marquee';
import { Reveal } from '../motion/Reveal';

const MOMENTS = [
  'Team dinner',
  'Airport terminal',
  'First date',
  'Friday pizza',
  'Wedding buffet',
  'New city, new menu',
  'Office birthday cake',
  'Late-night ramen',
  'Sunday brunch',
  'Road-trip drive-thru',
];

export function Moment() {
  return (
    <section className="bg-canvas py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <h2 className="mx-auto max-w-3xl text-center font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
            The menu is open. Everyone else is picking what sounds good.
            <span className="text-ink-faint"> You are picking what you will pay for tomorrow.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-ink-soft sm:text-lg">
            That guessing game is the whole problem. MyTummyHurts exists for exactly that moment,
            and every moment like it.
          </p>
        </Reveal>
      </div>
      <Reveal delay={0.25}>
        <div className="mt-14">
          <Marquee items={MOMENTS} />
        </div>
      </Reveal>
    </section>
  );
}
