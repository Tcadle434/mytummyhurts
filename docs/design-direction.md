# Design direction — "Deep Garden"

*The spec behind the `redesign/app-refresh` branch. Second iteration: the
first round (Instrument Serif + cream/sage retrofit + canvas ornaments) was
rejected by the founder on device screenshots — it read as the old app with
toppings. Deep Garden replaces it from the ground up.*

## The idea

One anchor color, used with total confidence: **deep evergreen** —
as *surfaces*, not just text. Every screen sits on a clean porcelain canvas
with pure-white borderless cards, and earns at most **one** evergreen
color-block: the screen's single most important statement, with Pip's own
mint and peach glowing against the dark green. Depth comes from
color-blocking and soft green-cast shadows — never hairlines, gradients,
blobs, or frosted mud.

## The system

- **Canvas** `#F7F6F2` porcelain · **cards** pure white, borderless,
  `tokens.shadow.card` (evergreen-cast) · **hero surfaces**
  `tokens.color.surface.hero.*` (`#12402F`, deep `#0C2E22`) with the
  `onHero / onHeroMuted / onHeroFaint` text ramp — never the light text ramp
  on dark.
- **Type**: **Bricolage Grotesque** (via `tokens.type.display.*` and
  `title.*`) for anything with a voice — headlines, verdicts, hero numerals.
  **Figtree** (`body.*`, `label.*`) for the quiet interface. No serifs.
  Numerals are chunky and confident (`display.metric`, 48px ExtraBold).
- **Color roles**: `accent.brand` `#1B5A40` is the bright action green
  (primary buttons, selected chips, FAB); Pip mint `#96C8AE` / peach
  `#FDA38B` are accents that pop on evergreen; five verdict tones
  (`status.verdict.*`) with text-grade foregrounds — text on a tone
  background always uses `foreground`, `tint` is for fills/dots/meters only.
- **Radii** 12–34, pill actions; **≤1 Pip per screen**; band words
  calm/mixed/rough echo wherever band colors appear.

## The rules (unchanged from round one — they were right; the palette wasn't)

1. One hero per screen, sized like a hero.
2. Display face only on findings; quiet face on chrome.
3. Triple-encode state: number + tone + Pip's face.
4. Every number answers its next question inline.
5. Exactly one saturated surface per screen — and now it's always evergreen.

## Where the evergreen hero lives

| Screen | Evergreen block |
| --- | --- |
| Home | Gut Score card (porcelain numeral, arc + Pip on dark) |
| Scan result | Pip's take panel under the white verdict card |
| Menu result | Top-pick spotlight |
| Check-in | none — the white question card with the live numeral is the hero |
| Check-in payoff | Score reveal (ring + numeral + band phrase) |
| Triggers | The caseboard hero (headline + confirmed names + counts) |
| Day detail | Day verdict + evidence story |
| Weekly progress | Week verdict |
| Symptoms | Month summary ("N calm days in June") |
| Paywall | The personalized starting picture |
| Capture / History / Settings / Auth | none — chrome stays porcelain |
