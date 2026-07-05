import { Reveal } from '../motion/Reveal';

const PROMISES = [
  {
    title: 'No cure claims',
    body: 'We will never tell you an app can heal your gut. This one finds patterns; clinicians treat conditions.',
  },
  {
    title: 'Unclear says unclear',
    body: 'When the evidence is thin, your read says so. No confident guesses dressed up as answers.',
  },
  {
    title: 'Your data stays yours',
    body: 'Self-hosted infrastructure, no data sales, and account deletion from Settings whenever you want.',
  },
];

export function Honesty() {
  return (
    <section className="bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <h2 className="text-center font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-4xl">
            What we will not tell you
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PROMISES.map((promise, index) => (
            <Reveal key={promise.title} delay={index * 0.1}>
              <div className="h-full rounded-panel bg-canvas p-6">
                <p className="font-display text-lg font-bold tracking-tight text-ink">
                  {promise.title}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{promise.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.25}>
          <p className="mt-10 text-center text-sm text-ink-faint">
            MyTummyHurts is not a medical device. It is for spotting patterns, not making diagnoses.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
