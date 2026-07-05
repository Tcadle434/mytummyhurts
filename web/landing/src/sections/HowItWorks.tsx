import { Reveal } from '../motion/Reveal';

/* Card 1 visual: a plate getting scanned (sweep line). */
function ScanVisual() {
  return (
    <div className="relative h-36 overflow-hidden rounded-2xl bg-evergreen-deep noise">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-5xl" role="img" aria-label="Bowl of food">
          🍜
        </span>
      </div>
      {/* Corner brackets */}
      {[
        'left-4 top-4 border-l-2 border-t-2',
        'right-4 top-4 border-r-2 border-t-2',
        'bottom-4 left-4 border-b-2 border-l-2',
        'bottom-4 right-4 border-b-2 border-r-2',
      ].map((pos) => (
        <span key={pos} className={`absolute h-5 w-5 rounded-sm border-mint/80 ${pos}`} />
      ))}
      <span className="sweep absolute inset-x-6 h-0.5 rounded-full bg-mint/90 shadow-[0_0_12px_rgba(150,200,174,0.9)]" />
    </div>
  );
}

/* Card 2 visual: the nightly 0-10 tap. */
function TapVisual() {
  return (
    <div className="flex h-36 flex-col justify-center gap-3 rounded-2xl bg-canvas p-5">
      <p className="text-sm font-bold text-ink">How did your gut feel?</p>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${
              n === 1
                ? 'bg-action text-canvas shadow-lift ring-2 ring-mint'
                : 'bg-white text-ink-faint shadow-card'
            }`}
          >
            {n}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-faint">From no symptoms to the worst. That is the whole habit.</p>
    </div>
  );
}

/* Card 3 visual: day dots turning into a read. */
function LearnVisual() {
  const days: ('calm' | 'rough' | 'none')[] = [
    'calm', 'calm', 'rough', 'calm', 'none', 'calm', 'rough',
    'calm', 'calm', 'calm', 'none', 'calm', 'calm', 'calm',
  ];
  const toneFor = (d: (typeof days)[number]) =>
    d === 'calm' ? 'bg-safe-tint' : d === 'rough' ? 'bg-confirmed-tint' : 'bg-watching-bg';
  return (
    <div className="flex h-36 flex-col justify-center gap-4 rounded-2xl bg-canvas p-5">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => (
          <span
            key={i}
            className={`dot-in h-4 w-4 rounded-full ${toneFor(day)}`}
            style={{ ['--dot-delay' as string]: `${i * 0.06}s` }}
          />
        ))}
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        14 days in: your calm days cluster around rice bowls. Rough ones follow the onions.
      </p>
    </div>
  );
}

const STEPS = [
  {
    number: '01',
    title: 'Scan what you eat',
    body: 'Point your camera at the plate, the menu, or the barcode. The ingredients are read in seconds.',
    visual: ScanVisual,
  },
  {
    number: '02',
    title: 'One tap before bed',
    body: 'How did your gut feel today? Zero to ten, once a day. No per-meal interrogations.',
    visual: TapVisual,
  },
  {
    number: '03',
    title: 'It learns your gut',
    body: 'Every calm day and every rough one sharpens your next read. The app gets more yours by the week.',
    visual: LearnVisual,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-canvas pb-24 pt-4 sm:pb-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-action">
            How it works
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl text-center font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
            Ten seconds a meal. One tap a night.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.12}>
              <article className="flex h-full flex-col gap-5 rounded-panel bg-white p-6 shadow-card transition-shadow duration-300 hover:shadow-lift">
                <step.visual />
                <div>
                  <p className="font-display text-sm font-bold text-action">{step.number}</p>
                  <h3 className="mt-1.5 font-display text-xl font-bold tracking-tight text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
