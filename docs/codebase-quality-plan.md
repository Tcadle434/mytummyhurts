# Codebase Quality Plan

> Generated from a whole-codebase review: 4 ECC reviewers (code-simplifier, database-reviewer,
> react-reviewer, typescript-reviewer) fanned across 20 slices → 240 findings → deduped.
> Goal: **less code, cleaner code, better/faster code.** We execute one phase at a time.

## Root causes (the two things that generate most of the bloat + the bugs)

1. **Scoring logic duplicated across FE/BE** — `server/src/scan/engine/scoring.ts` (3,770 lines) and
   `src/services/ai/scoring.ts` (1,955 lines) share 800+ lines of verbatim logic that has **silently diverged**.
2. **Domain types manually mirrored** — `src/types/domain.ts` (869) and
   `server/src/scan/engine/domain.ts` (777) duplicate ~600 lines of the same type graph, also drifting.

Realistic net removable after de-dup: **~2,000–2,800 lines**, plus ~1,500 reorganized out of oversized files.
`packages/` already exists → natural home for shared code (Phase 4).

---

## Correctness bugs (fix in Phase 0 regardless of refactors)

| # | Bug | Where |
|---|-----|-------|
| B1 | Risk thresholds diverge — FE hardcodes 67/34, BE uses 64/37 | `src/services/ai/scoring.ts` toRiskLevel/patternStrength vs `scoring.ts:575`/`:274` |
| B2 | `combinedRiskScore` formula divergence (`*0.9` in one copy) | `scoring.ts:712` vs `insights-learning.ts:30` |
| B3 | `dietStatusLabel` omits the `caution` case | `PersonalizedScanCard.helpers.ts` vs `scan-result/common.ts` |
| B4 | Identical-branch ternary `'logged' : 'logged'` | `DailyScoreDayScreen.tsx:89` |
| B5 | Diverging sort keys in `mostRecentDailyReport` FE vs BE | `store/helpers.ts:452` vs `learning-recompute.service.ts:50` |
| B6 | Empty catch swallows barcode errors | `scan-analysis.service.ts:237` |
| B7 | Uncleared `setTimeout` for push-token registration | `NotificationSchedulerBridge.tsx:60` |

---

## Phases

### Phase 0 — Quick wins & bug fixes · S · ~550 lines, zero/low risk
- [x] B1 — FE risk thresholds 67/34 → named constants 64/37 (toRiskLevel, patternStrength). Tests pass.
- [x] B3 — `dietStatusLabel` caution case added; kept module RN-free for testability (full dedup → Phase 1). Tests pass.
- [x] B4 — `meal logged`/`meals logged` pluralization fixed.
- [x] B6 — barcode lookup errors now logged via `this.logger.warn` instead of swallowed.
- [x] B7 — push-token `setTimeout` captured in a ref and cleared on cleanup.
- [x] Remove `__DEV__` console.log + unused `startedAt` in `liveClient.ts`.
- [~] B2 — `combinedRiskScore` `*0.9` divergence — **DEFERRED to Phase 4** (scoring-core extraction gives it one home; no blind behavior change now).
- [ ] B5 — `mostRecentDailyReport` diverging sort — deferred to Phase 2 (shared util extraction).
- [x] Deleted dead OpenAI non-audit path: `runResponsesRequest`, `runResponsesRequestWithRetry`,
      `normalizeExtraction` + unused wrappers `extractMealFromText/Image`, `extractMenuFromImages` (`openai.ts`, −97). Server `tsc` clean.
- [x] Deleted 137 lines of dead styles in `KnowBeforeEatDemo.tsx` (927→790, under limit; kept live `conditionsList`). eslint clean.
- [x] Deleted `stackMenuContributors` (returned null by design) + dead call-site branch (`scoring.ts`).
- [x] Removed commented-out `stageCopy`/`learningStageCopy` blocks in `InsightsScreen.tsx` (−14). eslint clean.
- [ ] Pass-through aliases (`isWaitingForComputedData`) in InsightsScreen + HomeScreen — deferred (cosmetic, ~2 lines).
- [x] **DONE — offline scoring path removed (net −595 lines).** Replaced the no-backend branch in `scanActions.ts`
      with a friendly thrown error ("Scanning needs a connection…", surfaces in `ScanAnalyzingScreen`'s error UI).
      Deleted `analyzeMealInput` + its entire orphaned cascade (`scoreCondition`, `pickDishBlueprint`,
      `createStructuredAnalysisFromBlueprint`, `createInterpretation`, `toRiskLevel`, sensitivity-bonus helpers,
      `dishLibrary` import, ~20 functions total). `scoring.ts` 1961 → 1392. KEPT the live recompute engine
      (`recomputeInsights`/`recomputeConditionIngredientInsights`) — it's used by every scan/report.
      Verified: eslint 0 unused, `tsc` clean, 31 FE tests pass.

**Phase 0 result: net −834 lines (+43 / −877) across 12 files. All verified — FE tests green, server `tsc` clean, eslint clean.**

### Phase 1 — Frontend shared UI & utils · S–M · ~500 lines
- [x] Consolidated date helpers onto `utils/weeklyProgress.ts` — deleted private copies in SymptomLogScreen + DailyGutReportScreen. eslint+tsc clean.
- [x] Generic `saveHealthProfileSection(...)` replaces the 3 identical SettingsScreen handlers. eslint+tsc clean.
- [ ] `src/utils/riskColor.ts` — risk-level→color + score→level (10+ private copies). CAUTION: preserve each call site's exact breakpoints/colors (some use 67/34, some 64/37) — do not silently unify thresholds.
- [x] `src/components/modals/CustomEntryModal.tsx` — modals were NOT verbatim duplicates (DailyGutReport is a distinct
      design, left untouched). Deduped **Onboarding + Settings** onto a shared component (net −111 lines). Reconciled
      Settings subtitle tertiary→secondary; added hitSlop to both. tsc clean, 147 tests pass.
- [x] `src/components/scan-result/styles.ts` — extracted resultCardStyle/cardTitleStyle/sectionLabelStyle; adopted in
      HeroCards/MenuCards/ScoreDrivers/IngredientCards (~−70 lines dup). common.ts had no StyleSheet. Kept radius 28
      (pixel-preserving; 28-vs-token a separate design call). tsc clean, 31 tests pass.
- [ ] Add `accessibilityRole`/`Label`/`State` on interactive Pressables app-wide

### Phase 2 — Backend shared utils & query consolidation · M · ~300 lines
- [ ] `server/src/scan/engine/text-utils.ts` — unify 5-7 text-normalization fns (also fixes match bugs)
- [ ] Move calibration parser + `profileSeedFromRow` + date helpers to `profile-mapper.ts`
- [ ] Extract `getUserContext(sql, userId, opts)` — 7-query block dup'd in home + profile services
- [ ] Move ~200 lines of personal-history logic from `scan-crud.service.ts` into `personal-history.ts`
- [ ] Nested-ternary dispatch chains → `Record<>` lookup maps (~66 lines)

### Phase 3 — Database performance · M · ~150 lines + latency
- [ ] N+1 write loops → multi-row `unnest` inserts (5 sites: learning, daily scores, RAG, taxonomy, profile)
- [ ] Parallelize query waterfalls: `getScan` (7→1 batch), `getHome` (~9→1; stop double-querying; UNION triggers/safe)
- [ ] Indexes: `auth_refresh_tokens(family_id)` partial, `(scan_id,user_id)` covering, partial leaf HNSW;
      drop unused thumbnail index; push `canonical_name`/`menu_item_source_id` filters into SQL
- [ ] Migrate early-migration RLS policies to `(select auth.uid())`
- [ ] `history()` OFFSET → keyset pagination

### Phase 4 — Shared scoring-core + domain package · L · ~1,500 lines (strategic)
- [ ] New `packages/` workspace pkg (pure TS, no platform deps) imported by Expo app + NestJS server
- [ ] Move in order: (1) 3 data tables, (2) ~20 pure utils + shared constants, (3) shared domain types,
      (4) large state-computation functions once shared `ProfileSeed` agreed
- [ ] CI test asserting FE/BE export identical members for shared primitives (drift guard)

### Phase 5 — God-file splits · L · structural (net ~0 lines)
- [ ] `OnboardingFlowScreen.tsx` (1,409) → `useOnboardingStepState`, `useOnboardingCta`, preview/selection panels
- [ ] `UI.tsx` (1,093) → Screen/Buttons/Cards/Atoms behind a barrel
- [ ] `scoring.ts` (3,770) → scoring-data/gut-score/scan-scoring/profile-builder (with Phase 4)

---

## Progress log
- **Phase 0 (DONE, net −834 lines):** 6 bug fixes (B1/B3/B4/B6/B7 + console.log), 4 dead-code deletions
  (OpenAI non-audit path, KnowBeforeEatDemo dead styles, `stackMenuContributors`, InsightsScreen commented code),
  and the full offline-scoring-path removal (`analyzeMealInput` + ~20-function cascade, −595 lines; FE scoring.ts
  1961 → 1392). Verified throughout: 31 FE tests green, server + FE `tsc` clean, eslint clean.
  Deferred to later phases: B2→P4, B5→P2, cosmetic `isWaitingForComputedData` aliases.
- **Next: Phase 1** — frontend shared UI/utils (riskColor util, CustomEntryModal, card styles, date helpers, save handler, a11y).
