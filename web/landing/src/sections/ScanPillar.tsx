import { Reveal } from '../motion/Reveal';

const MENU_ROWS = [
  { dish: 'Grilled salmon, jasmine rice', score: 22, read: 'Likely easy on your gut.', tone: 'safe' },
  { dish: 'Chicken pad see ew', score: 31, read: 'Should sit fine for you.', tone: 'safe' },
  { dish: 'Green curry, coconut rich', score: 58, read: 'Worth some caution for you.', tone: 'suspect' },
  { dish: 'Fried calamari, garlic aioli', score: 74, read: 'Likely rough for you. Tread carefully.', tone: 'confirmed' },
] as const;

const TONE_TEXT = {
  safe: 'text-safe-fg',
  suspect: 'text-suspect-fg',
  confirmed: 'text-confirmed-fg',
} as const;

const TONE_BAR = {
  safe: 'bg-safe-tint',
  suspect: 'bg-suspect-tint',
  confirmed: 'bg-confirmed-tint',
} as const;

export function ScanPillar() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">
              Scan anything
            </p>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              The whole menu, read for <span className="text-action">your</span> gut.
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink-soft sm:text-lg">
              At a restaurant, scan the menu and see what is likely easiest before the waiter comes
              back. At home, scan the plate. Every read is personal: the same dish scores
              differently for different guts.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <ul className="mt-8 flex flex-col gap-4">
              {[
                ['Meals, menus and barcodes', 'One camera button covers all three.'],
                ['Honest uncertainty', 'When the evidence is thin, the read says so instead of bluffing.'],
                ['Why, not just what', 'Each score names the ingredients driving it.'],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <svg className="mt-1 flex-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B5A40" strokeWidth="3" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-[15px] leading-relaxed text-ink-soft">
                    <strong className="font-semibold text-ink">{title}.</strong> {body}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.15} className="lg:justify-self-end">
          <div className="w-full max-w-md rounded-hero bg-canvas p-5 shadow-lift sm:p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold text-ink">Thai Garden · menu scan</p>
              <span className="flex items-center gap-1.5 rounded-full bg-cleared-bg px-3 py-1 text-xs font-semibold text-cleared-fg">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cleared-tint" />
                Ranked for you
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {MENU_ROWS.map((row) => (
                <div key={row.dish} className="rounded-card bg-white p-4 shadow-card">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold text-ink">{row.dish}</p>
                    <span className={`font-display text-lg font-extrabold ${TONE_TEXT[row.tone]}`}>
                      {row.score}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-watching-bg">
                    <div
                      className={`h-full rounded-full ${TONE_BAR[row.tone]}`}
                      style={{ width: `${row.score}%` }}
                    />
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${TONE_TEXT[row.tone]}`}>{row.read}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-ink-faint">Lower is easier on your gut</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
