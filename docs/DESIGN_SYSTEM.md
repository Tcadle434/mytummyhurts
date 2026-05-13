# MyTummyHurts Design System

## Purpose

This design system keeps visual decisions centralized and predictable.

- Raw brand values live in foundations only.
- Feature code should consume semantic tokens and shared primitives.
- Repeated semantic combinations should be promoted into component tokens.
- Every new token or shared primitive should be added to the internal design-system showcase screen.

## Theme structure

Public entrypoint:

- `src/theme/index.ts`

Internal layers:

- `src/theme/foundations.ts`
- `src/theme/tokens.ts`
- `src/theme/components.ts`
- `src/theme/mascot.ts`

## Rules

1. Do not place raw hex values in feature UI code.
2. Do not require Pip asset filenames directly from screens or feature components.
3. Do not invent new one-off text styles if an existing token style fits.
4. Use semantic tokens for color decisions:
   - `tokens.color.surface.*`
   - `tokens.color.text.*`
   - `tokens.color.status.*`
   - `tokens.color.info.*`
5. Use component tokens when the styling is an established UI pattern:
   - `components.card.*`
   - `components.button.*`
   - `components.chip.*`
   - `components.badge.*`
   - `components.tabBar.*`
   - `components.bottomSheet.*`
   - `components.chart.*`
6. When a screen needs a new repeated visual pattern, add it to `components.ts` instead of styling it ad hoc in multiple files.

## Typography

Official font pair:

- Display: `Instrument Serif`
- UI/body: `Plus Jakarta Sans`

Use named type styles from `tokens.type`:

- `display.hero`
- `display.section`
- `title.screen`
- `title.card`
- `body.default`
- `body.strong`
- `body.small`
- `label.button`
- `label.chip`
- `label.tab`

## Color guidance

- Green is the primary brand/action family.
- Blue is for informational and data visualization contexts only.
- Orange is the main medium-risk and caution family.
- Red is the high-risk and destructive/error family.
- Yellow is supporting highlight only. It should not become the primary medium-risk color.
- Warm neutrals are for raised backgrounds, gradients, and tracks.
- Cool neutrals are for secondary and tertiary text, muted icons, and low-emphasis UI chrome.

## Neutral ramps

Warm neutrals:

- `neutral.warm.0`
- `neutral.warm.50`
- `neutral.warm.100`
- `neutral.warm.200`

Cool neutrals:

- `neutral.cool.600`
- `neutral.cool.700`
- `neutral.cool.800`

Expected usage:

- `text.secondary` should come from the cool neutral ramp.
- `text.tertiary` and `icon.muted` should come from the cool neutral ramp.
- raised surfaces, app gradients, and chart tracks should come from the warm neutral ramp.

## Pip usage

Use the semantic mascot API:

- `PipState`
- `getPipAsset(state)`
- `<Pip state="..." />`

Approved states:

- `base`
- `subtle`
- `thinking`
- `waving`
- `joy`
- `love`
- `thumbsUp`
- `anxious`
- `pain`
- `sleepy`

Usage guidance:

- Empty and encouragement states: calm or positive Pip states.
- Analysis/loading: `thinking` or `subtle`.
- Success/confirmation: `thumbsUp` or `joy`.
- Warning-heavy moments: `anxious` or `pain`, used sparingly.

## Workflow for additions

1. Add or update the raw value in `foundations.ts` only if it is truly a new base color or scale.
2. Map it into a semantic token in `tokens.ts`.
3. If the pattern is reusable, add a component token in `components.ts`.
4. Migrate the consuming UI onto that semantic/component token.
5. Add a preview for it in `DesignSystemShowcaseScreen.tsx`.

## Enforcement defaults

- No raw hex in UI code outside the theme layer and mascot registry.
- No direct Pip asset requires in screens.
- No repeated styling decisions without a token owner.
