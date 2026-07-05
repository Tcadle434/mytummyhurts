import type { JSX } from 'react';

import { Pip } from './Pip';
import { VerdictChip } from './VerdictChip';

export type ScreenKey = 'scan' | 'score' | 'triggers';

export const SCREEN_ORDER: { key: ScreenKey; label: string }[] = [
  { key: 'scan', label: 'Scan' },
  { key: 'score', label: 'Gut Score' },
  { key: 'triggers', label: 'Triggers' },
];

/* ---------- Screen 1: scan result, the before-you-eat read ---------- */
function ScanScreen() {
  return (
    <div className="flex h-full flex-col gap-3 bg-canvas px-4 pb-4 pt-11">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Scan result
      </p>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="font-display text-[15px] font-bold leading-snug text-ink">
          Chicken pad see ew
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-14 w-14 flex-none">
            <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="#F2F1EC" strokeWidth="6" />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="#3E9B6E"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(31 / 100) * 150.8} 150.8`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-base font-extrabold text-ink">
              31
            </span>
          </div>
          <div>
            <p className="text-[13px] font-bold leading-tight text-safe-fg">
              Should sit fine for you.
            </p>
            <p className="mt-0.5 text-[10px] text-ink-faint">Lower is easier on your gut</p>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          For your profile
        </p>
        {[
          { name: 'IBS', width: '30%', tone: 'bg-safe-tint' },
          { name: 'Reflux', width: '44%', tone: 'bg-suspect-tint' },
          { name: 'Lactose', width: '18%', tone: 'bg-safe-tint' },
        ].map((row) => (
          <div key={row.name} className="mt-2.5 flex items-center gap-2">
            <span className="w-11 text-[11px] font-semibold text-ink">{row.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-watching-bg">
              <span className={`block h-full rounded-full ${row.tone}`} style={{ width: row.width }} />
            </span>
          </div>
        ))}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
          Wide rice noodles and a soy-based sauce, gentle for you. The garlic is the one to watch.
        </p>
      </div>
      <div className="rounded-2xl bg-white p-3.5 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Make it gentler
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
          Ask for light garlic and skip the chili oil. That would read closer to 24.
        </p>
      </div>
      <div className="noise mt-auto flex items-center gap-2.5 rounded-2xl bg-evergreen p-3">
        <Pip pose="thinking" size={34} className="flex-none" />
        <p className="text-[11px] leading-snug text-on-hero-muted">
          Close to dishes that sat fine on 5 of your last 6 calm days.
        </p>
      </div>
    </div>
  );
}

/* ---------- Screen 2: Gut Score home hero ---------- */
function ScoreScreen() {
  return (
    <div className="flex h-full flex-col gap-3 bg-canvas px-4 pb-4 pt-11">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Today</p>
      <div className="noise flex flex-1 flex-col items-center justify-center rounded-2xl bg-evergreen-deep p-4">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 112 112" className="h-28 w-28 -rotate-90">
            <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(247,246,242,0.14)" strokeWidth="8" />
            <circle
              cx="56"
              cy="56"
              r="48"
              fill="none"
              stroke="#96C8AE"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(78 / 100) * 301.6} 301.6`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-extrabold text-on-hero">
            78
          </span>
        </div>
        <p className="mt-3 font-display text-sm font-bold text-mint">calmer</p>
        <p className="mt-1 text-[10px] text-on-hero-faint">Higher score = calmer gut</p>
        <span className="mt-3 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-on-hero">
          Up 9 this week
        </span>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-card">
        <div>
          <p className="text-[12px] font-bold text-ink">How did your gut feel?</p>
          <p className="mt-0.5 text-[10px] text-ink-faint">One tap before bed</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-6 w-6 rounded-lg text-center text-[10px] font-bold leading-6 ${
                i === 0 ? 'bg-safe-bg text-safe-fg' : 'bg-watching-bg text-ink-faint'
              }`}
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Screen 3: trigger profile rows ---------- */
function TriggersScreen() {
  const rows = [
    { food: 'Onions', verdict: 'confirmed' as const, evidence: 'Rough on 4 of 5 days' },
    { food: 'Cold brew', verdict: 'suspect' as const, evidence: 'Rough on 2 days, case open' },
    { food: 'White rice', verdict: 'safe' as const, evidence: 'Calm on 3 of 3 days' },
    { food: 'Sourdough', verdict: 'cleared' as const, evidence: 'Calm on 6 of 6 days, zero rough' },
  ];
  return (
    <div className="flex h-full flex-col gap-3 bg-canvas px-4 pb-4 pt-11">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        Your triggers
      </p>
      <div className="noise rounded-2xl bg-evergreen p-3.5">
        <p className="font-display text-[14px] font-bold leading-snug text-on-hero">
          Two foods confirmed. One officially cleared.
        </p>
        <p className="mt-1 text-[10px] text-on-hero-faint">From 14 days of your own reports</p>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.food} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-card">
            <div>
              <p className="text-[12px] font-bold text-ink">{row.food}</p>
              <p className="mt-0.5 text-[10px] text-ink-faint">{row.evidence}</p>
            </div>
            <VerdictChip verdict={row.verdict} />
          </div>
        ))}
      </div>
    </div>
  );
}

const SCREENS: Record<ScreenKey, () => JSX.Element> = {
  scan: ScanScreen,
  score: ScoreScreen,
  triggers: TriggersScreen,
};

interface PhoneMockProps {
  active: ScreenKey;
  className?: string;
}

/** CSS-built iPhone. All three screens stay mounted and crossfade. */
export function PhoneMock({ active, className = '' }: PhoneMockProps) {
  return (
    <div
      className={`relative aspect-[9/19] w-[290px] rounded-[46px] bg-evergreen-deep p-[10px] shadow-modal ring-1 ring-white/15 sm:w-[310px] ${className}`}
    >
      <div className="relative h-full overflow-hidden rounded-[37px] bg-canvas">
        {SCREEN_ORDER.map(({ key }) => {
          const Screen = SCREENS[key];
          return (
            <div
              key={key}
              className={`screen absolute inset-0 ${active === key ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={active !== key}
            >
              <Screen />
            </div>
          );
        })}
        {/* Dynamic island */}
        <div className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-evergreen-deep" />
      </div>
    </div>
  );
}
