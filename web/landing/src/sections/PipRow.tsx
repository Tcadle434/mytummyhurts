import { Pip, type PipPose } from '../components/Pip';
import { Reveal } from '../motion/Reveal';

const STATES: { pose: PipPose; label: string }[] = [
  { pose: 'joy', label: 'calm streak' },
  { pose: 'thinking', label: 'reading a scan' },
  { pose: 'waving', label: 'first scan' },
  { pose: 'anxious', label: 'risky dish ahead' },
  { pose: 'love', label: 'good week' },
  { pose: 'sleepy', label: 'report logged, goodnight' },
];

export function PipRow() {
  return (
    <section className="overflow-hidden bg-canvas py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-action">
            Meet Pip
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-center font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl">
            Your gut, with a face.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-center text-base leading-relaxed text-ink-soft">
            Pip reads your day back to you at a glance: gentle, a little wry, and never once
            guilt-trippy about the fries.
          </p>
        </Reveal>
        <div className="mt-14 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {STATES.map((state, index) => (
            <Reveal key={state.pose} delay={index * 0.07}>
              <figure className="group flex flex-col items-center gap-3 rounded-panel bg-white p-4 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <Pip
                  pose={state.pose}
                  size={88}
                  className="transition-transform duration-300 group-hover:scale-110"
                />
                <figcaption className="text-center text-xs font-medium text-ink-faint">
                  {state.label}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
