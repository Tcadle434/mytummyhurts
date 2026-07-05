# mth-landing

Source for the mytummyhurts.app marketing site. The **built output is committed at
`server/landing/`** and served by the existing Caddy container (static
`file_server`, bind-mounted read-only). Deploy = build locally, commit, `git pull`
on the VPS. No infra changes ever needed here.

## Commands

```bash
npm run dev        # Vite dev server on :5173 (or .claude/launch.json "landing-dev")
npm run build      # client build + SSR prerender -> ../../server/landing
npm run typecheck
npm run images     # regenerate Pip WebPs from ../../brand-kit (only when art changes)
```

## Contracts that must not break

- `/privacy.html` and `/terms.html` keep those exact URL shapes (App Store Connect
  references the privacy URL). They are plain static HTML with **zero JS**; content
  is verbatim from `src/data/legal.ts` in the app.
- `assets/og.png` and `assets/favicon.png` stay at stable unhashed URLs
  (`public/assets/`).
- `src/config.ts` `APP_STORE_URL` is the launch switch: empty string renders the
  launching-soon note; paste the real URL at launch and rebuild.
- Content rules live in [BRIEF.md](./BRIEF.md): every claim true of the shipped
  product, no banned copy, page readable without JS (build prerenders the full
  page into index.html), lean page weight.

## Design

Deep Garden system, mirroring the app's tokens (`src/theme/foundations.ts`):
evergreen surfaces `#0C2E22`/`#12402F`, porcelain canvas `#F7F6F2`, Pip mint
`#96C8AE` / peach `#FDA38B`, five verdict tones, Bricolage Grotesque + Figtree
(self-hosted via Fontsource). Motion is CSS keyframes + IntersectionObserver
reveals, all disabled under `prefers-reduced-motion`, and gated behind an
`html.js` class so no-JS readers see everything.

## History

Supersedes both the courtroom-themed static site previously in `server/landing`
and the abandoned prototype at `~/MyTummyHurts/landing_page` (kept outside this
repo; do not resurrect either).
