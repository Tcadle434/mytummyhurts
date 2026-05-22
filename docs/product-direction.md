# MyTummyHurts Product Direction

Last updated: 2026-05-20

## Core Thesis

MyTummyHurts should own one high-frequency decision:

> I have gut issues and I am about to eat. Tell me what is safest, what is riskiest, why, and learn whether you were right.

The product should not become a generic food diary, calorie tracker, wellness dashboard, or broad medical management tool. The strongest wedge is real-time confidence before eating, especially when ordering from menus, eating out, getting takeout, traveling, or choosing prepared food.

Gut Score stays important. Its job is retention, progress, and gamification. It should make the user feel like the app is helping them improve over time. It should not replace the immediate utility of scanning and deciding what to eat.

## Primary ICP

The primary customer is an adult with recurring gut symptoms who still has to make food decisions in normal life.

They likely have one or more of:

- IBS, reflux/GERD, bloating, gas, constipation, diarrhea, nausea, or recurring stomach discomfort.
- Weekly or more frequent symptoms, but not necessarily a formal diagnosis.
- Anxiety around restaurants, takeout, travel meals, social meals, or packaged food.
- Prior attempts with Googling, food diaries, elimination diets, low-FODMAP content, supplements, or doctor advice.
- Willingness to pay if the app quickly reduces decision stress and helps them avoid feeling bad.

The strongest initial ICP is not the most medically severe user. It is the user whose symptoms are common enough to be annoying, unpredictable enough to create anxiety, and frequent enough that better food decisions have recurring value.

## Non-ICP

Avoid optimizing V1 around:

- Severe allergy safety.
- Celiac disease compliance.
- IBD clinical management.
- Eating disorder recovery.
- Prescription digital therapeutic reimbursement.
- Weight loss, calorie tracking, or macro tracking.
- Broad "heal your gut" wellness positioning.

These categories either require stronger clinical guarantees, create liability, demand different workflows, or pull the app into crowded markets with different purchase intent.

## Market Read

The market supports a paid consumer subscription if the product solves a concrete food-decision problem.

- IBS is common enough to support a focused consumer category. NIDDK cites studies suggesting about 12% of people in the United States have IBS, and notes overlap with GERD and other conditions.
- Diet and nutrition apps are a large paid mobile market. Grand View Research estimates the global diet and nutrition app market at USD 2.14B in 2024 and projects USD 4.56B by 2030, with paid in-app purchase services as a major segment.
- Successful adjacent products monetize concrete workflows:
  - Nerva sells a structured IBS gut-brain therapy program at a high subscription price.
  - Fig and Spoonful sell food confidence through scanners and restriction-aware grocery decisions.
  - mySymptoms has durability as a flexible food/symptom diary, but that is a slower, more work-heavy behavior.
  - Monash has authority as the clinical low-FODMAP reference, but its one-time paid app is not the same subscription model.
- The reimbursement-first prescription digital therapeutic path is risky. Pear Therapeutics' bankruptcy is a warning that clinical efficacy alone does not guarantee a viable business model if distribution and reimbursement are hard.
- Bayer's Cara Care acquisition shows strategic interest in IBS digital care, but that path is enterprise/clinical. MyTummyHurts should start with a consumer wedge before considering clinical partnerships.

## Product Positioning

Use:

> Know how you are likely to feel before you eat it.

Sharper app-store/paywall framing:

> Scan a menu or meal and see what is likely safest for your gut, what to avoid, and why.

Avoid:

- "Heal your gut."
- "Fix your gut."
- "Guaranteed symptom prevention."
- Fake trust claims like "10k+ users" or "4.9 stars" unless verified.
- Medical certainty language.

The app should feel like a personal food risk advisor, not a doctor, nutritionist replacement, or generic wellness coach.

## Product Pillars

1. Real-time food decisions
   - Menu scan.
   - Meal scan.
   - Manual meal description.
   - Clear risk ranking, reasons, and safer modifications.

2. Personal learning
   - The app learns from the user's profile and daily symptoms.
   - It should get more personalized over time without requiring burdensome logging.

3. Progress and motivation
   - Gut Score gives the user a visible improvement loop.
   - Weekly trend, streaks, and progress should motivate continued use.

4. Low-friction accountability
   - Daily symptom report is the default logging behavior.
   - The product should avoid asking for feedback after every meal by default.

## Gut Score Decision

Do not remove Gut Score from the hero. Reframe it.

Gut Score should remain emotionally central because it creates progress, gamification, and a reason to come back. But it should be paired with the immediate decision CTA so the app does not become a vague wellness dashboard.

Recommended home hero structure:

- Gut Score value.
- Weekly movement, for example "Up 9 this week."
- Primary CTA: Scan menu.
- Secondary CTA: Log today.

The score answers:

> Am I trending better?

Scanning answers:

> What should I eat right now?

Implementation rule:

- Gut Score is the game layer.
- Menu and meal scanning are the core utility.
- Do not let Gut Score copy crowd out the scan action above the fold.

## Symptom Reporting Decision

Default to one daily symptom report, not post-meal prompts after every scan.

Rationale:

- Asking after every meal feels intense and can turn the app into homework.
- Many gut symptoms are delayed, especially bloating, gas, constipation, and IBS-related symptoms.
- A daily habit is easier to maintain and better aligned with the product's emotional tone.

However, daily reporting should be scan-aware.

If the user recently scanned meals or menus, the daily report should reference them:

> Yesterday you scanned Buffalo Chicken Fries. Did you notice reflux, bloating, gas, pain, or no symptoms?

This gives the app meal-linked learning without intrusive meal-by-meal nagging.

Recommended attribution windows:

- Reflux/GERD: strongest weight same day and within hours.
- Bloating/gas/IBS-style symptoms: strongest weight from 6 to 48 hours.
- Constipation: strongest weight from 24 to 72 hours.
- Food poisoning/nausea illness: treat separately from personalized trigger learning.

Implementation rule:

- Use daily report as the default learning loop.
- Add optional meal-specific follow-up only for high-risk scans, user-initiated tracking, or explicit opt-in.
- Never block the core scan flow behind symptom logging.

## Feature Priorities

### Double Down

1. Menu scanner
   - This is the strongest differentiated wedge.
   - It solves an urgent, anxious, real-world moment.
   - It is more monetizable than passive tracking because value is obvious immediately.

2. Meal scanner
   - Useful as a general fallback and for leftovers, home cooking, takeout, and prepared food.
   - Keep it subordinate to menu/ordering in positioning.

3. Personalized explanations
   - The app must explain why an item is risky for this user's profile.
   - Avoid generic nutrition judgment.
   - Good explanation format: trigger, condition relevance, confidence, and suggested modification.

4. Safe modifications
   - "Ask for sauce on the side."
   - "Swap fries for rice."
   - "Avoid onion/garlic-heavy dressing."
   - "Choose grilled over fried."

5. Daily report tied to recent scans
   - Use once-daily symptom collection to improve future recommendations.
   - This is the sustainable data moat.

6. Saved safe orders
   - Users should be able to build a personal list of meals/restaurants that worked.
   - This is both retention and trust.

### Keep, But Secondary

1. Gut Score
   - Keep in hero.
   - Use as progress/gamification.
   - Do not make it the only first-screen job.

2. Insights
   - Useful after the user has data.
   - Should not dominate early UX before the app has earned trust.

3. History
   - Necessary for credibility and recall.
   - Avoid making the app feel like a diary-first tool.

4. Weekly progress
   - Good retention layer.
   - Must be grounded in scan and symptom behavior, not vague wellness.

### Ditch Or Deprioritize

1. Token top-ups as a primary business model
   - They make the product feel metered at the exact moment users need confidence.
   - Prefer subscription with fair-use scan limits or soft abuse prevention.

2. Broad condition expansion
   - Do not chase every digestive condition in V1.
   - IBS/reflux/bloating is enough for a coherent wedge.

3. Heavy daily reports
   - The daily report must be fast.
   - Asking too much will reduce adherence.

4. Generic content feed
   - Education is useful when tied to a user's scan or symptom pattern.
   - Avoid a generic wellness article product.

5. Mascot-heavy trust layer
   - Personality is fine.
   - Medical-adjacent advice needs clarity, evidence, and calm explanations more than cuteness.

## Home Screen Direction

The first screen should make two things obvious:

1. How am I doing?
2. What should I eat next?

Recommended hierarchy:

1. Hero: Gut Score, trend, primary scan CTA, secondary daily log CTA.
2. Recent scan or next useful action.
3. Today's symptom report state.
4. Safe orders / recent wins.
5. Insights and weekly progress.

Avoid making the home screen feel like:

- A generic analytics dashboard.
- A static score page.
- A diary.
- A content feed.

## Menu Result Direction

Menu result language should avoid "best" and "worst" as moral nutrition labels.

Use:

- "Lowest risk found"
- "Highest risk found"
- "Likely easier on your gut"
- "Likely harder on your gut"

Avoid:

- "Healthy"
- "Unhealthy"
- "Good"
- "Bad"
- "Safe" unless confidence and disclaimers are clear.

Menu ranking should account for:

- User profile: conditions, symptoms, sensitivities, history.
- Ingredient risk: known triggers and plausible aliases.
- Preparation risk: fried, creamy, spicy, acidic, rich, high-fat, sauce-heavy.
- Confidence: whether the menu item is explicit or inferred.

The product should show calibration across the full 0-100 scale. Truly high-risk items for the user's profile should be able to score near 100.

## Monetization

Recommended V1 model:

- Free onboarding.
- Free first menu scan or small free trial scan allowance.
- Paywall after the first useful result, when value is concrete.
- Subscription as the main business model.

Suggested initial pricing tests:

- Monthly: USD 7.99-9.99.
- Annual: USD 49.99-69.99.
- Current USD 34.99 annual can work as an intro price, but may underprice the value if menu scanning is strong.

Paid promise:

- Menu scan rankings.
- Meal scans.
- Personalized trigger learning.
- Daily report learning loop.
- Saved safe orders.
- History and insights.
- Fair-use scanning rather than visible token anxiety.

Avoid leading with top-ups. Top-ups can exist later for exceptional high-volume use, but should not be the core monetization story.

## Success Metrics

Activation:

- Onboarding completion rate.
- First scan completion rate.
- First scan result viewed.
- First scan result expanded.
- First saved safe order or "would eat" action.

Core value:

- Menu scan success rate.
- Time to menu result.
- Percent of menu scans with actionable ranking.
- Percent of result screens where user expands an item.
- Percent of scans followed by a daily report within 48 hours.

Retention:

- D1, D7, D30 retention.
- Weekly active scanners.
- Daily report completion rate.
- Gut Score viewed.
- Gut Score improvement streaks.
- Repeat menu scans per subscriber.

Monetization:

- Paywall view to trial start.
- First useful scan to conversion.
- Trial to paid conversion.
- Annual plan selection rate.
- Refund rate.
- Churn after first month.

Quality:

- Analysis failure rate.
- Ambiguous result rate.
- High-risk false-low complaints.
- Low-risk false-high complaints.
- Average menu scan latency.
- Percentage of scans with enough extracted items.

## Implementation Checklist

Near-term product changes:

- Keep Gut Score in the home hero, but pair it with a primary scan CTA.
- Replace unsupported trust/paywall claims unless verified.
- Reword menu results away from "best/worst" toward risk language.
- Ensure the daily report references recent scans.
- Add delayed symptom attribution windows in learning logic.
- Add explicit confidence and uncertainty handling to scan results.
- Add menu screenshot evals from real restaurant menus.
- Add scoring regression cases for obviously high-risk meals.
- Track scan latency and failure reasons separately for upload, model, parsing, scoring, and persistence.

Design constraints:

- The app should feel calm, practical, and confidence-building.
- Avoid shaming food.
- Avoid turning every meal into a medical event.
- Keep daily report short enough to complete in under 30 seconds.
- Make explanations concrete enough to earn trust.

## Strategic Decision

MyTummyHurts should flourish by being the fastest way for gut-sensitive people to make food decisions in the real world.

Gut Score should remain the motivational progress system. Daily reporting should remain the low-friction learning loop. Menu and meal scanning should remain the paid utility that makes the product worth opening and worth subscribing to.

The app wins when users think:

> This helps me choose what to eat now, and over time it learns what actually works for my gut.

## References

- NIDDK: IBS definition, prevalence, and overlap with other conditions: https://www.niddk.nih.gov/health-information/digestive-diseases/irritable-bowel-syndrome/definition-facts
- ACG IBS guideline summary: low-FODMAP trial and gut-directed psychotherapy recommendations: https://pubmed.ncbi.nlm.nih.gov/33315591/
- AGA IBS best practices: dietary counseling and brain-gut behavior therapies: https://gastro.org/news/nine-guideline-based-best-practices-for-ibs/
- Grand View Research diet and nutrition apps market report: https://www.grandviewresearch.com/industry-analysis/diet-nutrition-apps-market-report
- Nerva App Store listing: https://apps.apple.com/us/app/nerva-ibs-gut-hypnotherapy/id1467398796
- Fig App Store listing: https://apps.apple.com/us/app/fig-food-scanner-guide/id1564434726
- Spoonful App Store listing: https://apps.apple.com/us/app/spoonful-food-scanner/id1481914232
- mySymptoms App Store listing: https://apps.apple.com/us/app/mysymptoms-food-diary/id405231632
- Bayer Cara Care acquisition: https://www.bayer.com/media/en-us/bayer-acquires-hidoc-technologies-and-cara-care-app-for-irritable-bowel-syndrome/
- Pear Therapeutics bankruptcy coverage: https://www.healthcaredive.com/news/pear-therapeutics-bankruptcy-PEAR/647203/
