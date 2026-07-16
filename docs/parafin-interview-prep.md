# Parafin — Partner Engineer Interview Prep

Prep guide for the recruiter screen with Marianna Eyngorina (30 min via Calendly) and the rounds that follow.

---

## 1. The company in 90 seconds

**What they do:** Parafin is embedded financial infrastructure. Platforms that already hold small-business sales data (marketplaces, POS, payroll, vertical SaaS) use Parafin to offer white-labeled financing to their merchants — the platform's brand, Parafin's underwriting, capital, servicing, and compliance under the hood.

**Products:**
- **Capital** — working-capital financing / merchant cash advances, repaid as a fixed fee + a percentage of daily sales (not interest-bearing loans — this distinction matters in fintech conversations)
- **Spend** — branded charge card for merchants
- **Pay Over Time** — installments

**Partners:** Amazon, DoorDash, Walmart, TikTok Shop, Gusto, Mindbody, Jobber, SpotOn, Worldpay, ~18+ more.

**Traction:** $35B+ in financing offers extended, 50,000+ businesses funded, 84 NPS. Forbes Fintech 50 (2026).

**Recent momentum (good "why now" material):**
- June 2026: new credit facility led by **Goldman Sachs** + One William Street
- May 2026: expanded warehouse facility with SVB, EverBank, Trinity Capital
- Founded by ex-**Square Capital** data science leads; team from Stripe, Square, Plaid, Coinbase; backed by GIC, Redpoint, Ribbit, Thrive

**The core insight to show you get:** platforms have proprietary, real-time sales data that banks don't. That data makes underwriting small businesses viable, and embedding the offer where merchants already work makes distribution nearly free. The Partner Engineer sits exactly at the seam where that data and UX flow between partner and Parafin.

---

## 2. The role (from the actual JD)

Reports into **GTM Engineering**. Comp $175K–$220K + equity, SF (hybrid/in-office).

You're the technical counterpart for the full partnership lifecycle:
- **Pre-launch:** technical discovery, feasibility, scoping the integration approach with partners
- **Launch:** main technical liaison guiding partners through onboarding and new product integrations
- **Post-launch:** technical account management — optimizing integrations, expanding product usage, debugging critical issues fast
- **Leverage:** build internal tools, maintain integration docs, feed partner pain back into product

**Requirements they'll screen against:**
- 5+ yrs client-facing technical work (integrations / partner support / TAM)
- 2+ languages (Java/Python/JavaScript preferred); comfortable in a React/Scala/Python codebase
- REST APIs, webhooks, SDKs, data pipelines, embeddable UI components
- Built demos and production apps
- Nice-to-have: SQL, fintech experience, post-sales best practices

---

## 3. Your story → their needs

Map every answer back to one of these (adjust with resume specifics):

| They need | You have |
|---|---|
| Production API + webhook integrations | RevenueCat billing integration end-to-end: purchase flow, webhook-driven billing sync, restore handling, StoreKit sandbox testing |
| Third-party auth/identity integration | Real Apple, Google, and email auth wiring, including debugging provider-specific edge cases |
| Full-stack fluency (React + backend + SQL) | React Native app + self-hosted NestJS/Postgres(pgvector) backend, 39-migration schema history — JavaScript/TypeScript and SQL covered |
| Data pipelines / reliability thinking | Deterministic scoring engine guarded by a 48-case regression suite + golden evals that fail CI on false-lows; scheduled maintenance workers; observability |
| Demos and production applications | A shipped, subscription-monetized iOS app built solo — the strongest possible "demonstrated experience creating demos and production applications" |
| Navigating unfamiliar codebases | Patch-package fixes inside Expo SDK pods to work around toolchain mismatches — literally patching someone else's code to unblock a launch |

**Gaps to have an answer for:**
- **Scala:** be honest — haven't shipped it, but you read/navigate unfamiliar codebases routinely (point to the Expo pod patches) and TypeScript → Scala type-system concepts transfer. Don't oversell.
- **"Client-facing" years:** frame whatever customer/stakeholder-facing work is on your resume as the throughline — the JD is really asking "can you sit between a partner's engineers and ours without a PM translating?"
- **Fintech:** it's a nice-to-have, not required. Your RevenueCat/billing work is adjacent (money movement, reconciliation, webhooks about financial events).

---

## 4. Domain vocabulary to be conversant in

You don't need to be an expert; you need to not stumble on these:

- **MCA (merchant cash advance)** vs. loan: fixed fee, repaid as % of sales, no fixed term/APR — Parafin's core Capital product mechanics
- **Offer lifecycle:** platform sends sales data → Parafin underwrites → pre-approved offer surfaces in-platform → merchant accepts → funds disbursed → repayment via sales splits → renewals
- **Integration surfaces:** REST API, **webhooks** (offer created/accepted, repayment events), **embedded UI components** (their white-label widgets), data ingestion (partner sales data feeds — this is the "data pipelines" line in the JD)
- **KYC/KYB, OFAC screening** — Parafin handles compliance so partners don't have to; know the acronyms
- **Sandbox vs. production credentials**, API keys, idempotency, webhook signature verification, retries/backoff — standard integration-engineering hygiene they'll expect you to speak fluently

---

## 5. The recruiter screen itself (Marianna, 30 min)

This round is: can you tell your story crisply, does comp align, why Parafin. Prepare:

1. **2-minute narrative:** who you are → the throughline (builder who owns integrations end-to-end and can explain them to non-engineers) → why Partner Engineering specifically (you like the seam between customer and codebase, not just heads-down feature work).
2. **"Why Parafin":** embedded finance is the rare fintech model where distribution is solved; their data-advantage underwriting; Goldman facility + Fintech 50 = inflection point; the role touches every part of the stack you enjoy. Read the **"Why Parafin, Why Now" PDF she attached** before the call and reference one specific thing from it.
3. **Comp:** range is posted ($175–220K). If asked, anchor to the top half based on breadth (full-stack + customer-facing) rather than giving a number first if you can avoid it: "the posted range works for me; where I land should reflect that I cover both the build and the client-facing sides."
4. **Logistics answers ready:** SF hybrid/in-office expectations, start-date availability, work authorization, current interview pipeline status.

**Questions to ask her (pick 2–3):**
- How is Partner Engineering split across the lifecycle — do the same people own pre-sales scoping and post-launch TAM, or is it pooled?
- What does the interview process look like from here? (Gets you the roadmap.)
- What's the ratio of net-new partner launches vs. expanding existing partners right now?
- How big is the Partner Engineering / GTM Engineering team today?

---

## 6. Likely later rounds — start prepping now

Typical shape for PE/SE roles at this stage of company:

1. **Hiring manager screen** — deep dive on a past integration you owned. Pick your best one and rehearse it STAR-style: scope, the ugly debugging moment, how you communicated with the external party, the outcome.
2. **Technical/integration case study** — e.g. "A partner wants to embed Capital offers in their merchant dashboard. Walk us through discovery → integration design → launch." Practice whiteboarding: data feed in, webhook events out, embedded component vs. API-only build, sandbox testing plan, error/edge cases (merchant fails KYB, webhook delivery fails, offer expires).
3. **Live debugging / API exercise** — reading API docs cold, making requests, diagnosing a broken webhook or malformed payload. Warm up with curl/Postman against any public API; practice narrating your debugging out loud.
4. **Cross-functional / partner-communication round** — explaining a technical failure to a non-technical partner PM, pushing back on an unreasonable partner ask, writing a status update mid-incident.
5. **SQL screen possibly** — joins, aggregations over an offers/repayments-shaped schema. One evening of practice suffices.

**Story bank to write out (one paragraph each, STAR):**
- Hardest third-party integration bug you've debugged (RevenueCat/StoreKit or auth-provider material is strong)
- A time you translated a technical constraint for a non-technical stakeholder
- A time you found the root cause in code you didn't write (Expo pod patches)
- Building a guardrail/process that scaled (regression suite + golden evals gating CI)
- A time partner/customer feedback changed what you built

---

## 7. Before you book the Calendly

- ✅ Sanity check passed: role is real (posted on Parafin's Ashby board, Glassdoor, Built In SF; same comp range). Still, confirm the sender domain is **@parafin.com** and the Calendly is the same link — never share SSN/bank info at this stage regardless.
- Read the attached "Why Parafin, Why Now" PDF and note one specific talking point.
- Skim parafin.com product pages (Capital, Spend, Pay Over Time) and one partner case study.
- Book the slot promptly — responsiveness is itself a signal for a client-facing role.

Good luck. This role is basically "person who builds real integrations and can talk to humans about them" — which is what shipping this app solo demonstrates.

---

## 8. Hiring manager screen — draft answers

**Walk me through your background (≤2 min):** full-stack engineer drawn to the seams between systems → shipped a consumer iOS app end-to-end (RN + NestJS/Postgres), favorite parts were the integrations (Apple/Google auth, RevenueCat webhook-driven billing sync, restores, reconciliation) → Partner Engineering is that work as the whole job.

**Why Parafin (3 reasons):** distribution solved (Amazon/DoorDash/Walmart live, Goldman facility just closed) · integration surface is the full stack (data feeds, APIs, webhooks, embedded components) · personal reason [fill in].

**Integration you owned end-to-end (STAR):** RevenueCat/StoreKit billing. Spend prep time on the Action section — one specific hard debugging moment, told as detective work across docs, dashboards, webhook logs. Result: production payments + regression tests gating billing paths.

**Hard bug in code you didn't write:** Expo iOS pods incompatible with local Xcode → read pod source, wrote patch-package fixes, reproducible builds. Takeaway: third-party code isn't a black box.

**Difficult stakeholder / explaining tech to non-tech:** [pick a real one tonight: their frustration → your translation → outcome]. If pressed on thin client-facing years: building a consumer product solo is continuous translation of technical constraints into user-facing decisions.

**Questions for the HM:** partner load per engineer? hardest launch and why? where does PE influence roadmap? what separates great from fine in this role?

**If Scala comes up:** haven't shipped it; routinely navigate unfamiliar code (patched vendored pods); comfortable learning in the codebase.

**If integration design comes up:** four-pipe model — data in (underwriting), offers/UI out (embedded vs API vs hybrid), webhooks out (lifecycle events), repayment in (sales splits + reconciliation data stream).

---

## 9. STAR stories — Magic Eden (your strongest, all true)

These map to Amit's rubric: owned integration end-to-end · custom-fix-vs-scalable-solution · voice of the customer · cross-functional/roadmap · tricky debugging · SDKs/provider APIs · client-facing.

**Delivery rule:** lead with the business framing, go technical only when the interviewer leans in (Amit will). Name the "custom vs scalable" tradeoff out loud — it's the differentiator.

### STAR #1 — Scalable standards over a custom SDK (headline)
- **S:** Owned Magic Eden's crypto wallet integration surface across 3 ecosystems (Solana, EVM, Bitcoin). Problem: partner adoption of our wallet was low. Root cause — adding a new wallet meant every partner writing custom code for it.
- **T:** Talked to several highest-volume partners; consistent feedback — they already had wallet libraries wired in and didn't want to write bespoke code to add us. Brought a recommendation to leadership: instead of a custom SDK (per-partner integration work + forever maintenance for us), make our wallet conform to existing ecosystem standards so partners' existing tooling drives it automatically.
- **A:** Implemented the standard provider interfaces per chain — Solana Wallet Standard (what wallet-adapter uses); EIP-1193 + EIP-6963 on EVM; a generic provider for Bitcoin (no mature standard). Supported the standard methods — connect, signMessage, signAndSendTransaction, signAllTransactions — and emitted events like accountChanged. Owned the docs. Drove onboarding directly, prioritized by volume, ran partner working-sessions over Telegram.
- **R:** Partners could support us with ~zero custom code; onboarded across all major partners in the industry (massive volume — no exact number, say "all the major partners representing the bulk of ecosystem volume"). Turned integration from bespoke per-partner work into out-of-the-box; removed our maintenance burden by conforming to standards vs. a one-off SDK.
- **The line that lands:** "The lazy path was a custom SDK per partner; I chose the scalable path — conform to the standard so the whole ecosystem's tooling just works with us."

### STAR #2 — The namespace-collision bug (debugging)
- **S:** A Bitcoin Runes marketplace partner (Runes = Bitcoin's fungible-token standard) reported users trying to connect the Magic Eden wallet but a *different* installed wallet extension popping up instead.
- **T:** Owned wallet integrations, took it. Tricky part: couldn't reproduce with just our wallet — only happened when a user had one specific other wallet also installed.
- **A:** Installed that other extension myself to mirror their users' exact setup, reproduced it. Code investigation showed both wallets injecting into the *same* global browser namespace (`window.bitcoin`) — fighting over one injection point, last-loaded wins. Fix: expose the ME wallet at its own dedicated namespace, keep backwards compat with the shared one but prioritize our connection, bump the wallet version, ship.
- **R:** Their users connected reliably after. Kicker: same class of problem EIP-6963 solves on EVM (multiple injected wallets colliding on one namespace) — we'd avoided it on EVM by conforming to that standard; Bitcoin had no equivalent, so we solved it manually.

### Other true stories in the bank (from MyTummyHurts)
- RevenueCat/StoreKit billing bug → webhook-driven integration debugging.
- Expo pod patch → root-cause in code you didn't write.
- Regression suite + golden evals → guardrail/process that scaled.
- Carpool → API changes driven by partner requests + direct client implementation.

### Honest framing for the webhook-experience gap
Real production real-time experience is **streaming-based, not HTTP-webhook**: Magic Eden ran a Geyser indexing layer streaming on-chain data → backend → websockets to frontend/consumers. Push model is identical. Built a webhook prototype (signed delivery, retries+backoff, idempotency, token-secured embedded widget) to get hands-on with the HTTP-delivery specifics. Never call the Geyser/websocket work "webhooks."
- Auth framing: **API key** = system→us (static secret, server-to-server); **webhook signature (HMAC)** = us→partner (authenticity, reverse direction); **OAuth** = end-user delegating scoped/expiring access (no password). Wallet signMessage = the web3 auth pattern (prove ownership via signature).
- Delivery-mechanism spectrum: **polling** for current state (consumer's cadence, simple), **websockets** for high-frequency streaming (consumer opens persistent connection — backend or browser), **webhooks** for discrete cross-org events (provider POSTs to consumer's endpoint). Direction flips: poll/ws = consumer reaches out; webhook = provider reaches out.

---

## 10. Behavioral answers — why / trajectory + explaining to non-technical

### "Why this role / career trajectory" (the arc + the honest ambition, framed as growth-within-Parafin)
**The throughline (your real arc):** bank / big-systems eng (~3 yrs) → started a dev agency, 2 yrs working *directly with clients* idea→ship (the "spark") → founding Partner Engineer, worked with technical partners on the Solana indexer — **one of those partners acquired us** → 18 months solo going deep on AI workflows / next-gen dev → now missing working with people on hard technical problems + being the translator between partner and business.
- Lead with: "I keep gravitating back to working directly with partners."
- **Lean hard on:** "I worked so closely with a technical partner on our indexer that they ended up acquiring us." (best partner-relationship proof point)
- Gap = intentional: "spent 18 months solo to go deep on AI workflows and the next generation of development." One sentence.

**Trajectory — reframe (avoid flight-risk):** DON'T say "I don't see myself as an IC long-term." DO frame PM ambition as growth *from* PE, *at Parafin*:
> "I'm genuinely excited to be a great Partner Engineer and develop those relationships. It fits my long arc because PE is the best foundation for growing into technical product — you absorb what partners and their end users actually value every day. I'd love to grow that direction at Parafin over time, and being someone who can prototype and build gives me an edge in the role now."

**Why Parafin (specific + personal — this is the mic-drop):**
> "Having run an agency, I felt firsthand how brutal distribution is when you don't have an edge. Parafin makes distribution the *partner's* — the business is delivered through platforms merchants already use. That's a genuinely elegant model, and it's why I think there's enormous room for embedded financial infrastructure to grow."

### Explaining to a non-technical audience (Amit flagged this TWICE)
**The skill:** deliberate plain language at the right altitude; analogy only if truly needed; **when they flag a word, define it immediately — never repeat it raw.**

- **What's an API?** "A way for your software to *ask* our software for information, automatically. A fixed set of questions your system can ask ours — 'is this merchant approved?', 'what's their offer amount?' — and for each, we instantly send back a clean answer your app can use. 'Calling our API' just means your system asking one of those questions and getting the answer — software-to-software, no person involved. The API is the doorway between your systems and ours."
- **What's a webhook / why not just poll?** "An API is you-ask/we-answer; a webhook flips it — we send you the data the instant it's available (e.g., a merchant accepted an offer or got funded). Why not just keep asking us? Because you'd have to guess *when* — a merchant might accept minutes or hours later, and you can't know when. So you'd either ask constantly and mostly get 'nothing new,' or ask too rarely and find out late. The webhook means you find out the instant it happens, no wasted asking."

**Delivery habits to keep:** build on what they already understand · define scary words · ground every concept in *their* job · land a crisp one-sentence definition · trim voice filler / pause instead of "um."

### STAR #3 — Saying "no" to a partner, well (judgment + cross-functional)
**Deploy for:** "a time you disagreed / pushed back / said no to a customer / worked with Product / a tough judgment call." NOT your opener — hold for a conflict/judgment prompt.
- **S:** Owned Magic Eden's public API layer. A partner (a market maker) requested we return "diamonds" in the API response — diamonds = our loyalty/points program; more diamonds → larger allocation of our token at the drop.
- **T:** Reasonable-seeming ask, but it's a *public* API — adding a field exposes it to *every* consumer, not just the one partner who asked. My job was to weigh that.
- **A:** Flagged the risk, drove a discussion with the PMs. Concern: exposing diamonds publicly would let anyone **game the points system** — e.g., place bids/asks that sit on collections without ever executing real trades, farming points without real trading. So even though this market maker asked in good faith, general exposure would incentivize farming over real volume. We decided not to return it. I took the "no" back to the partner directly over Telegram, explained the farming/abuse scenario and why we couldn't expose it broadly — they understood and were completely fine with it.
- **R:** Protected the integrity of the points program and token distribution — kept rewards tied to real trading, not gamed activity — and kept the partner relationship intact.
- **Framing line:** "A request on a shared public API is never just about the one partner who asked — you have to consider every consumer, and sometimes the right partner-engineering move is a well-reasoned no."
- **Parafin parallel (name it):** exposing financial data via an API means constantly asking "what abuse/gaming does this field enable across *all* consumers?" — e.g., exposing underwriting signals that could be gamed, or data that lets someone farm offers. Same judgment.

### Story ordering (match to the question, don't fix a sequence)
- Open-ended "project you're proud of / owned end-to-end" → **#1 Standards** (always the lead).
- "Tricky bug / hardest problem" → **#2 Namespace bug** (natural follow-up to #1).
- "Disagreed / pushed back / said no / worked with Product / tough call" → **#3 Diamonds**.
- Bridge between them: "that's one of a few examples from owning that surface — another was..." (signals depth, not one lucky project).
