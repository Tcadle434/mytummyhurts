# Design direction — original palette, redesign structure

*The spec behind the `redesign/app-refresh` branch, fourth iteration. Round
one (Instrument Serif + cream retrofit + canvas ornaments) was rejected on
device screenshots. Round two ("Deep Garden") went dark-evergreen-surfaces
and was rejected after living with it: dark blocks dominated daily-use
screens. Round three ("daylight") invented new warm hexes and was rejected
immediately: no new colors, period. Round four is the settled rule:*

**The color scheme is the ORIGINAL app palette, restored exactly from
`main` — every value verbatim, nothing invented. The redesign keeps
everything that is not color: type, layout, product structure.**

## The split

- **Colors: original.** Warm cream canvas `#FDF7F1`, warm-white cards
  `#FDFAF6` with hairline borders + soft black shadows, warm card `#FEF5EA`,
  mint actions `#5BA687` (scan CTA is the original mint gradient
  `mascot → brand → brandStrong`), ink `#212B32`, accent greens `#2F6953` /
  `#478A70`, the original status warmth (orange `#FB913A`, red `#F5634A`,
  medium bg `#FEEACB`). Focused tab: mint icon/label on the soft
  success-green pill. Gut Score numeral: zone-tinted (the orange 37).
- **Structure: redesign.** Bricolage Grotesque + Figtree type scale
  (`tokens.type.*`), one-hero-per-screen layout, the caseboard verdict
  model, Pip triple-encode, pill actions, tab bar shape.

## New concepts, old colors

Concepts that didn't exist in the old app take their colors from the old
palette only:

- **Hero blocks** (`tokens.color.surface.hero.*`): the plain old card
  surface `#FDFAF6` — the old Gut Score card was a regular card, so the hero
  earns its weight from size and the lift shadow, not a tinted background
  (the warm `#FEF5EA` read yellow at card scale and was rejected). On-hero
  ramp = ink / old secondary / old tertiary; raised = old track `#ECE4D9`.
  Screens use the ramp, never raw text tokens.
- **Verdict tones** (`status.verdict.*`): built from the old risk/status
  colors — confirmed = old high, suspect = old medium, watching = old
  neutrals, safe = old low, cleared = old accent green family (`#2F6953` on
  `#E8F4EC`, tint `#478A70`) so the earned verdict outranks the hopeful one.
  Text on a tone background always uses `foreground`; `tint` is for
  fills/dots/meters only.
- **Camera viewfinder** (`surface.viewfinder.*`): the original capture
  overlays — ink card behind the feed, `#0E1210` glass, white controls.
  The one dark surface in the app; video is dark, nothing else may be.

## The rules (they survived every round)

1. One hero per screen, sized like a hero.
2. Display face only on findings; quiet face on chrome.
3. Triple-encode state: number + tone + Pip's face.
4. Every number answers its next question inline.
5. ≤1 Pip per screen; band words calm/mixed/rough echo wherever band colors
   appear.

## Where the hero lives

| Screen | Hero block (old card white, lift shadow) |
| --- | --- |
| Home | Gut Score card (zone-tinted numeral, arc + Pip) |
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
