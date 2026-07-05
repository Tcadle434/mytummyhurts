import { VerdictChip, type Verdict } from '../components/VerdictChip';
import { Reveal } from '../motion/Reveal';

interface FoodRow {
  food: string;
  emoji: string;
  verdict: Verdict;
  evidence: string;
}

const ROWS: FoodRow[] = [
  { food: 'Onions', emoji: '🧅', verdict: 'confirmed', evidence: 'Rough on 4 of the 5 days you ate them' },
  { food: 'Cold brew', emoji: '🧋', verdict: 'suspect', evidence: 'Rough on 2 of 4 days so far, not settled yet' },
  { food: 'Greek yogurt', emoji: '🥣', verdict: 'watching', evidence: 'Two days in, no verdict yet' },
  { food: 'Sourdough', emoji: '🍞', verdict: 'cleared', evidence: 'Calm on 6 of 6 days, zero rough ones' },
];

export function LearnPillar() {
  return (
    <section id="triggers" className="bg-canvas py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">
              Trigger Profile
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Learn which foods are actually yours to worry about.
              <span className="text-action"> And which never were.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 text-base leading-relaxed text-ink-soft sm:text-lg">
              Every food you eat earns its verdict from your own days, counted plainly. No generic
              trigger lists, no lifetime bans on a hunch.
            </p>
          </Reveal>
        </div>

        <div className="mx-auto mt-14 flex max-w-2xl flex-col gap-3">
          {ROWS.map((row, index) => (
            <Reveal key={row.food} delay={index * 0.1}>
              <div
                className={`flex items-center gap-4 rounded-panel bg-white p-5 shadow-card transition-shadow duration-300 hover:shadow-lift ${
                  row.verdict === 'cleared' ? 'ring-2 ring-cleared-tint/50' : ''
                }`}
              >
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-canvas text-2xl" aria-hidden="true">
                  {row.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold tracking-tight text-ink">{row.food}</p>
                  <p className="mt-0.5 truncate text-sm text-ink-soft">{row.evidence}</p>
                </div>
                <VerdictChip verdict={row.verdict} />
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mx-auto mt-10 max-w-2xl rounded-panel bg-cleared-bg p-6 sm:p-8">
            <p className="font-display text-xl font-bold tracking-tight text-cleared-fg sm:text-2xl">
              Sourdough: back on the menu.
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              This is the part most gut apps skip. Foods you have quietly feared for years can earn
              their way back, proven by your own calm days. A shorter worry list beats a longer one
              every time.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
