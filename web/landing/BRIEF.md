# Landing page product brief (v2 rebuild, 2026-07-05)

The v1 page failed because it recycled the OLD site's framing and sold a
generic food scanner. This brief is the product truth. The page must be
written from what the product actually is as of this week.

## BANNED (verbatim or paraphrased from the old site)
"Four taps from will this hurt to oh that's why" · "Scan/Score/Log/Improve"
four-step cards · "One number for how settled" · "part mascot, part mood
ring" · "Your stomach has been trying to tell you something" · numbered
01-04 step cards · any copy lifted from landing_page/sections.jsx.

## What this product actually is (each of these is BUILT and live)
1. **Verdicts with receipts.** Every food you eat builds a case that ends in
   one of five verdicts: confirmed trigger, under review, watching, looking
   safe, cleared. Verdicts are earned from YOUR days — "rough on 3 of the 4
   days you ate it" — never from a generic list. Evidence counts are real
   distinct days, shown on everything.
2. **The moat: it clears foods.** Every other gut app only blames. This one
   exonerates: eat something calmly enough times and it is officially
   cleared — "you can stop worrying about tomatoes." There's a celebration
   when it happens. The emotional promise is food freedom, not restriction.
   THIS is the hero story.
3. **Honest uncertainty.** Scores are bands, not fake precision. Unclear
   scans say "unclear" instead of guessing. Every trigger shows its evidence
   count and confidence. Scan results cite real literature (Monash FODMAP,
   NIDDK) — and citations only appear when they match what's on the plate.
4. **Personalization that's earned.** Your conditions (IBS, reflux, lactose,
   gluten) tune what surfaces first. Your own calm/rough days are the ONLY
   thing allowed to move a verdict band. Portions count (light/normal/heavy).
   It even warns about stacking: "second dairy-heavy meal today."
5. **The scorer gets scored.** The app tracks whether its own predictions
   came true against your actual days (predictive validity). No competitor
   does this. Frame: "We keep score on ourselves."
6. **Pip + tone.** Gentle, wry, zero guilt. Not a medical device. 7 days
   free. iPhone, launching imminently (App Store CTA, placeholder URL
   constant already in landing.js — keep that mechanism).

## Site architecture (product-first, in this order)
1. HERO — lead with the moat: the promise of eating without fear + verdicts
   you can trust. A live-feeling caseboard fragment (cleared band prominent)
   beats a phone frame mock.
2. THE CASE FILE — how a verdict gets earned: scan meals → one-tap daily
   check-in → days become evidence → verdict lands (confirmed OR cleared).
   Show a real evidence sentence: "Calm on 4 of 4 days you ate it — cleared."
3. CLEARED IS THE POINT — the exoneration section. Celebration moment.
   "The first gut app whose best news is what you CAN eat."
4. HONESTY — bands/confidence/citations/predictive validity. "Unclear scans
   say so." "We keep score on ourselves."
5. PIP — brief, charming, the states as emotional range (write NEW copy).
6. CTA + footer (privacy.html/terms.html links stay — App Store needs them).

## Constraints
- Deep Garden tokens (already in styles.css :root) — evergreen/porcelain/
  mint/peach, Bricolage Grotesque + Figtree. Keep the verdict tone palette.
- Pure static, no framework. Assets in ./assets (Pip states, logo, og).
- Content must be readable with JS disabled (no opacity-0 gated sections).
- Page weight < 600KB. Full SEO/OG set (exists in v1 head — keep/refresh).
- Every claim on the page must be TRUE of the shipped product. When in doubt
  check the app repo (src/, server/src/) — it's the source of truth.
