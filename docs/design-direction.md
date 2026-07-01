# Design direction — "Pip's field notes"

*The spec behind the `redesign/app-refresh` branch. Written after a full design
audit of every screen (2026-07-01).*

## The diagnosis

The design system was always good — warm cream canvas, Instrument Serif
display face, Plus Jakarta Sans body, sage + peach Pip identity, pillowy
cards. The problem: **the system's voice was never deployed.** The Instrument
Serif appears in exactly one production place (the unused Wordmark). Every
screen outside Home is set in one sans family at 12–24px, every card shares
one silhouette, and the most human content the backend produces — verdict
sentences, evidence stories, "why this score" receipts — is typeset as
footnotes or never rendered at all.

Home works because it accidentally follows five rules nothing else follows.
The redesign names those rules and applies them everywhere.

## The five rules (Home's DNA, bottled)

1. **One hero, sized like a hero.** Every screen answers its user's #1
   question first, with a 2.5–3× type-scale jump and the screen's only
   illustration. Nothing else on the screen may compete.
2. **Serif = findings. Sans = chrome.** Anything the app has *concluded* —
   Gut Score numerals, scan verdicts, trigger statuses, day verdicts, payoff
   headlines — is set in Instrument Serif (`tokens.type.display.*`). All
   controls, labels, and meta stay Plus Jakarta Sans. The serif is Pip's
   handwriting in the field notebook; the sans is the notebook's printed grid.
3. **Triple-encode state: number + color + face.** Where there's a verdict,
   the numeral color, the tone surface, and (once per screen) Pip's emotion
   agree. Anxious users read the face before the number.
4. **Every number answers its own next question, inline.** Scale (`/100`),
   direction ("higher = calmer"), context (trend), and depth (ⓘ) ride along.
   No dead-end metrics, no unexplained integer ranges ("67–100").
5. **Exactly one saturated surface per screen — the action.** Everything else
   is cream, white, hairline ink borders, 6%-opacity shadows.

## Voice and tone rails

- Questions, not nouns: "How did your gut feel?" never "Gut severity".
- Band words echo everywhere a band color appears: calm / mixed / rough.
- Status text uses the darker `foreground` tone on tone backgrounds — never
  `tint` (a bar-fill color) as text.
- Detective vocabulary (case, verdict, suspect, cleared, caseboard) lives
  **only** inside the Triggers screens.
- Neutral surfaces for symptoms and conditions — never success-green chips
  under "Diarrhea".
- Honest uncertainty: no "Steady this week" for users with no history; the
  disabled button says what it's waiting for.

## System additions (this branch)

- `tokens.type.display.metric` — Instrument Serif numerals (46/50) for hero
  scores; `display.hero/section/accent` finally get consumers.
- `tokens.color.status.verdict` — the five caseboard tones (confirmed /
  suspect / watching / safe / cleared) with text-grade foregrounds. Cleared
  is a *deeper* green than safe: the earned verdict outranks the hopeful one.
- Ambient canvas: `AppScreen` now renders the mint/peach ornament blobs that
  existed in the token file but never shipped.
- `HeroMetric`, `VerdictPill`, `EvidenceMeter` shared primitives; `EmptyState`
  gains a CTA slot so empty screens route to the first scan instead of dead-
  ending.

## Where each screen's hero lives

| Screen | Hero (the one memorable thing) |
| --- | --- |
| Home | Kept — Gut Score card (numeral + arc + Pip) |
| Scan capture | The viewfinder itself; header chrome shrinks |
| Scan analyzing | Pip breathing in the ring, serif headline, staged reassurance copy |
| Scan result | The verdict sentence in serif over the meal photo — "can I eat this?" answered first |
| Daily check-in | The severity slider as a single asked question, band word echoing live |
| Check-in payoff | One animated ring + serif verdict + what tonight taught the system (incl. Gut Score delta) |
| Triggers | The caseboard: five verdict counts + confirmed names in serif; learning stage demoted to a cue |
| Trigger detail | The verdict headline in full status color with the evidence sentence at reading size |
| Symptoms | The month as an emotional record: "9 calm days this month" headline, calm/mixed/rough legend |
| Weekly progress | A week verdict in serif with one supporting visualization |
| Day detail | Day verdict + one-sentence evidence story with real meal photos |
| History | Days as the unit: each date group carries its day verdict |
| Settings | "What Pip knows about you" profile card; feedback beside the thing saved |
| Paywall | The personalized starting picture (serif starting score) instead of an infomercial headline |
