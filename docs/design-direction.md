# Design direction — "Deep Garden, daylight"

*The spec behind the `redesign/app-refresh` branch. Third iteration: round
one (Instrument Serif + cream/sage retrofit + canvas ornaments) was rejected
on device screenshots — it read as the old app with toppings. Round two
("Deep Garden") replaced it from the ground up with dark evergreen surfaces;
the founder lived with it and rejected the darkness — evergreen blocks
dominated daily-use screens (four dark elements on Home alone) and the app
lost the old lightness and warmth. Round three keeps everything structural
from Deep Garden and relights it: same bones, daylight palette.*

## The idea

The garden stays; the lights come on. Every screen sits on a **warm cream
canvas** with white borderless cards, and earns at most **one warm hero
block** — peach-cream, never dark: the screen's single most important
statement. **Evergreen is demoted from surface to accent**: it lives in the
wordmark, text accents, icons, and small fills, and must never be a
background that dominates a screen. Actions are **mint**. Depth comes from
color-blocking and soft neutral shadows — never hairlines, gradients, blobs,
or frosted mud.

## The system

- **Canvas** `#FDF7F1` warm cream · **cards** pure white, borderless,
  `tokens.shadow.card` (soft neutral) · **hero surfaces**
  `tokens.color.surface.hero.*` (`#FDF0DE`, deep `#FBE6CC`) with the
  `onHero / onHeroMuted / onHeroFaint` ramp — ink-based now, but screens
  still must use the ramp, never raw text tokens, so the hero can retint
  without touching screens.
- **Type**: **Bricolage Grotesque** (via `tokens.type.display.*` and
  `title.*`) for anything with a voice — headlines, verdicts, hero numerals.
  **Figtree** (`body.*`, `label.*`) for the quiet interface. No serifs.
  Numerals are chunky and confident (`display.metric`, 48px ExtraBold).
- **Color roles**: `accent.brand` is mint `#5BA687` (primary buttons,
  selected chips, FAB, scan CTA — white foreground); `accent.brandStrong` /
  `text.accent` keep deep evergreen (`#12402F` / `#1B5A40`) for wordmark and
  text-grade accents; Pip mint `#96C8AE` / peach `#FDA38B` are decorative
  accents only — never text on the warm hero (use `text.accent` there); five
  verdict tones (`status.verdict.*`) with text-grade foregrounds — text on a
  tone background always uses `foreground`, `tint` is for fills/dots/meters
  only.
- **The one dark surface**: the camera viewfinder
  (`tokens.color.surface.viewfinder.*`, deep evergreen glass + porcelain
  text) — dark because video is dark. Nothing else in the app may be dark.
- **Radii** 12–34, pill actions; **≤1 Pip per screen**; band words
  calm/mixed/rough echo wherever band colors appear.

## The rules (unchanged across rounds — they were right; the palette wasn't)

1. One hero per screen, sized like a hero.
2. Display face only on findings; quiet face on chrome.
3. Triple-encode state: number + tone + Pip's face.
4. Every number answers its next question inline.
5. Exactly one saturated-ish surface per screen — and now it's the warm
   peach-cream hero, with a single mint action pill allowed beside it.

## Where the warm hero lives

| Screen | Hero block |
| --- | --- |
| Home | Gut Score card (ink numeral, arc + Pip on peach-cream) |
| Scan result | Pip's take panel under the white verdict card |
| Menu result | Top-pick spotlight |
| Check-in | none — the white question card with the live numeral is the hero |
| Check-in payoff | Score reveal (ring + numeral + band phrase) |
| Triggers | The caseboard hero (headline + confirmed names + counts) |
| Day detail | Day verdict + evidence story |
| Weekly progress | Week verdict |
| Symptoms | Month summary ("N calm days in June") |
| Paywall | The personalized starting picture |
| Capture / History / Settings / Auth | none — chrome stays cream |
