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
| B6 | Empty catch swallows barcode errors | `scan-analysis-executor.service.ts` |
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
- [x] Consolidated risk/score color mappers into `src/utils/risk.ts` (`riskLevelColors`, `riskLevelTint`, `gutScoreTint`).
      Replaced 9 private copies across onboarding components + progress/symptom screens; `DailyScoreRing.scoreTint` now
      delegates to `gutScoreTint` (one source of truth). All 67/34 gut-score copies were identical — no threshold change.
      Left `riskLevelForScore` (risk-score→level, different semantics) for later. tsc clean, 147 tests pass.
- [x] `src/components/modals/CustomEntryModal.tsx` — modals were NOT verbatim duplicates (DailyGutReport is a distinct
      design, left untouched). Deduped **Onboarding + Settings** onto a shared component (net −111 lines). Reconciled
      Settings subtitle tertiary→secondary; added hitSlop to both. tsc clean, 147 tests pass.
- [x] `src/components/scan-result/styles.ts` — extracted resultCardStyle/cardTitleStyle/sectionLabelStyle; adopted in
      HeroCards/MenuCards/ScoreDrivers/IngredientCards (~−70 lines dup). common.ts had no StyleSheet. Kept radius 28
      (pixel-preserving; 28-vs-token a separate design call). tsc clean, 31 tests pass.
- [x] Added `accessibilityRole`/`accessibilityLabel`/`accessibilityState` across 8 components (ScreenHeader, HomeScreen
      banner+CTA, SymptomLog month-nav/CalendarDay/ReportRow, InsightsScreen expander, SettingsRow, HistoryCard, MenuRow),
      and extracted `MemberRow` in InsightDetailScreen (replacing `<Text>`-as-button). tsc clean, 147 tests pass.

**Phase 1 complete.** 6 commits (b287af8 → a11y). Net effect: shared `utils/risk.ts` color API, `weeklyProgress` date
helpers, `CustomEntryModal`, `scan-result/styles.ts`, one Settings save helper; ~−330 lines of FE duplication removed
(a11y adds ~+50 for accessibility coverage). All behavior/pixel-preserving; FE tsc clean, 147 tests green throughout.

### Phase 2 — Backend shared utils & query consolidation · M · DONE (3 commits: ec25454, c354b66, bf8c722)
- [x] `engine/text-utils.ts` — merged the 3 **byte-identical** `normalize` copies. Divergent normalizers left as-is
      (dietRubric `&->and`, `normalizeKey`, `normalizeIngredientName`, menuRubric, the `textHasTerm` family) to preserve matching.
- [~] Calibration parser / `profileSeedFromRow` / date helpers — **investigated, deliberately NOT merged.** The 3
      `parseCalibrationRatings` copies diverge (profile.service trims keys + propagates `undefined`); `toIso` fallbacks
      differ too. Merging would risk persisted calibration data → left, documented. (Would need a deliberate behavior decision.)
- [x] `getUserContext(sql, userId, opts)` extracted — 7-query block deduped across home + profile services (c354b66).
- [x] Moved pure personal-history logic from `scan-crud.service.ts` (702→472) into `personal-history.ts` (ec25454).
- [x] BE nested-ternary → helpers/lookup maps: `ingredientRiskScore`, `imageRefKind` (×5), `contributorEvidence` Record (bf8c722).

**Phase 2 complete.** Behavior-preserving throughout; server tsc clean, 167 tests pass on every commit.

### Phase 3 — Database performance · DONE (safe scope) · 2 commits (5018c86, 4888e86)
- [x] N+1 write loops batched (profile conditions/sensitivities/diet, learning insights, RAG chunks, taxonomy upsert);
      daily-score UPDATEs → Promise.all (JSONB cols don't vectorize). getScan + getHome parallelized via Promise.all.
      Behavior-preserving; 167 tests pass against the real DB. (5018c86)
- [x] Indexes: `auth_refresh_tokens(family_id)` partial, `(scan_id,user_id)` covering ×2, drop unused thumbnail index.
      Validated in a rolled-back tx. (4888e86)
- [ ] **DEFERRED (noted, higher risk / needs decisions):**
      - partial leaf HNSW index + `hnsw.ef_search` — expensive index rebuild + recall-affecting; do deliberately.
      - RLS `(select auth.uid())` sweep — sensitive AND possibly **vestigial in self-hosted** (verify RLS is even
        enforced when the app connects as `mth_app` before touching policies).
      - getHome UNION triggers/safeFoods + stop double-querying scans/reports — query restructure (medium risk).
      - `history()` OFFSET → keyset pagination — **API-contract change**, needs coordinated FE pagination update.

**Phase 3 safe scope complete.** Remaining: **Phase 4** (shared scoring/domain package + scoring.ts split).

### Phase 4 — Shared scoring-core + domain package · L · IN PROGRESS (branch `refactor/phase4-shared-scoring`)
- [x] **4a — Foundation wired & proven (846bc8d, pushed).** `@mth/shared-domain` consumable by BOTH Expo (Metro) and
      NestJS: builds to dist + `prepare` self-build; `file:` deps linked in both node_modules; resolution via Metro
      extraNodeModules, both tsconfig paths, both vitest aliases, node runtime. First dedup: RiskLevel + PatternStrength
      (both domain.ts re-export). Verified: FE tsc, server tsc, FE 147, server 167, nest build, runtime resolution.
      ⚠️ **Live Metro bundle + server boot NOT smoke-tested yet** — confirm before migrating the bulk onto the package.
- [x] **4b — 53 shared domain types migrated (0c0bf2e, pushed).** gut-score/profile/menu/scan modules; both domain.ts
      re-export. FE domain.ts 871→414, server 779→317. tsc/tests/build green.
- [x] **4c — 22 byte-identical scoring values migrated (762b713, pushed).** 3 data tables + 14 utils + 5 constants.
      FE scoring.ts 1392→1159, server 3760→3534. `combinedRiskScore` confirmed identical in both scoring.ts (B2's 0.9
      divergence is in insights-learning.ts, separate). tsc/tests/build/runtime green.
- [x] **4d Tier-1 — DONE (aed5765, pushed).** The small, real consistency fixes:
      - ✅ **Daily-score threshold drift** — FE `computeDailyScoreForReport` now uses shared `RISK_LEVEL_HIGH_MIN`/`RISK_LEVEL_MILD_MAX`
        (64/36) + `clampNumber`, matching the server. FE/BE daily scores now compute identically. 147 tests, no value changes needed.
      - ✅ **B2** — `insights-learning.ts` now uses the shared `combinedRiskScore` (dropped the `*0.9`); seed + learned on one scale.
        Verified the 0.9 wasn't a behavior contract. 167 tests, no value changes needed.
      - ✅ **EvidenceCitation** — 4 divergent defs collapsed to one canonical package type (`chunkId?` optional superset); domain.ts +
        riskAdjudication.ts re-export it. Type-only.
- [~] **4d Tier-2 — NOT pursuing (by decision).** State functions (`computeGutScoreState`/`buildUserProfile` vs `…FromSeed`/etc.) are
      divergent BY DESIGN (FE `OnboardingAnswers`/`ScanRecord` vs server `ProfileSeed`/`ScanForInsightRecompute`). Investigation showed the
      authenticated+online flow ALREADY uses server-returned values; the FE local recompute is mostly **onboarding starting-score** + offline/
      fallback. The high-leverage alternative (if ever pursued) is to compute the **onboarding starting score server-side** (it already shows a
      compute animation) → would let the FE drop its scoring engine and make the server the single source of truth. That's a **product/feature
      decision**, not a refactor. Left for a deliberate future call.
- [~] **4d Tier-3 — skipped:** `MenuItemAnalysis` server-only `componentRoles` (intentional divergence); brace-style cosmetic diffs (low value).
- [ ] split server scoring.ts (now ~3,534) into modules — structural, behavior-preserving; do as its own focused task + CI drift-guard test.

### Phase 5 — God-file splits · DONE (2 commits: 028049b, c271ee7)
- [x] `UI.tsx` (1,093) → 4-line barrel + `ui/{Screen,Buttons,Forms,Cards,shared}` (all <800). 22-export parity verified (028049b).
- [x] `OnboardingFlowScreen.tsx` (1,251 → **696**) → presentational parts (`OnboardingFlowParts.tsx`) + styles + helpers.
      Conservative: ALL state/refs/effects kept in the main component (no hook extraction — onboarding lacks behavior tests). (c271ee7)
- [~] `scoring.ts` (server, ~3,750) split → bundled into **Phase 4** (do it alongside the scoring-core extraction).

**Phase 5 complete (FE god-files).** tsc/eslint clean, 147 tests pass on each commit.

---
## Status: Phases 0, 1, 2, 5 DONE. Remaining: Phase 3 (DB perf) + Phase 4 (shared scoring/domain package, incl. scoring.ts split).

---

## Progress log
- **Phase 0 (DONE, net −834 lines):** 6 bug fixes (B1/B3/B4/B6/B7 + console.log), 4 dead-code deletions
  (OpenAI non-audit path, KnowBeforeEatDemo dead styles, `stackMenuContributors`, InsightsScreen commented code),
  and the full offline-scoring-path removal (`analyzeMealInput` + ~20-function cascade, −595 lines; FE scoring.ts
  1961 → 1392). Verified throughout: 31 FE tests green, server + FE `tsc` clean, eslint clean.
  Deferred to later phases: B2→P4, B5→P2, cosmetic `isWaitingForComputedData` aliases.
- **Next: Phase 1** — frontend shared UI/utils (riskColor util, CustomEntryModal, card styles, date helpers, save handler, a11y).
