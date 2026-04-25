# Deferred Surfaces — Stage 0 Closeout

**Date:** 2026-04-25
**Source plan task:** Task 2 (5-surface E2E sweep)
**Owner decision:** Defer all 5 with documented runbooks per design R1 (`design.md` § Risks · R1)
**Status:** Stage 0 proceeds to closeout with all 5 surfaces deferred; A1 evidence will accrue naturally from Stage 1+ real-traffic flows. Each deferral has an explicit unblock condition.

---

## Common context: why all 5 are deferred

Task 1 produced a non-trivial finding that affects every webhook-receiving scenario in the DTS team:

> **Make scenarios receiving external webhooks have undocumented input-payload contracts.** Synthetic test payloads can pass HMAC verification (signature filter accepts) but fail to match BasicRouter conditions or postgres-query mappers, resulting in scenario completions that produce no tri-write evidence.

This was demonstrated end-to-end with the DLQ scenario (`4688746`, evidence in `surface-evidence-dlq.md`). The Apr 21 checkpoint's tri-write probes hit the same outcome. The HMAC fix is necessary but not sufficient.

Per the v5.1 design's R1 stop-condition rule:
- ≤1 surface deferred → close Stage 0 with deferral documented
- ≥2 surfaces deferred → halt and re-evaluate

We are deferring 5 surfaces, exceeding the R1 threshold for "close as designed." But the deferrals are NOT blocking on infrastructure problems. They are blocking on a documentation/contract issue that is ITSELF being addressed by v5.1 amendment item B1-expanded (input-payload contracts in Appendix H, captured 2026-04-25 in the surface-evidence-dlq.md findings section).

The R1 rule's intent was to prevent Stage 0 from closing when underlying systems are broken. Here, the systems are not broken — they're underspecified. Closing Stage 0 with deferrals + the v5.1 amendment item that addresses the underspecification IS the design-correct path. The user has explicitly approved this path (Cowork session 2026-04-25).

---

## Surface 1 — Stripe

**Status:** DEFERRED (pre-existing per Task 0 finding; not affected by scenario-contract issue)

**Blocker:** No Make scenario currently receives Stripe webhooks. The Stripe gateway-webhook scenario is owned by Stage 4.1 (Stripe Kickoff Kit saga, Appendix K). Until that scenario is built, there's no surface to fire a signed test against.

**Runbook to unblock:**
1. Stage 4.1 build creates the Stripe gateway-webhook scenario per Appendix K
2. Once active, fire signed `checkout.session.completed` test event using `STRIPE_WEBHOOK_SECRET` from Doppler `dobeu-core/prd`
3. Verify tri-write artifacts (Supabase ledger row + Linear issue + Datadog event + R2 archive object)
4. Update this file: change Stripe status to PASS

**Stage-1 dependency:** Stage 1.x does not directly depend on Stripe surface working — Stripe surface is Stage 4 territory. So Stripe deferral does not block Stage 1 start.

---

## Surface 2 — Typeform

**Status:** DEFERRED on scenario-contract finding

**Blocker:** Two scenarios consume Typeform webhooks:
- `4653306` — Typeform Submit → Apollo Enrich → Customer.io + Email (active)
- `4653307` — Typeform Rate → Apollo Enrich → Customer.io + Email (active)

Both have the same payload-contract issue: BasicRouter conditions and Apollo lookup mappers expect specific Typeform field shapes (form_id, hidden fields, answers array structure) that aren't documented anywhere. A signed synthetic test would pass Typeform HMAC verification but probably fail to match enrichment branches.

**Runbook to unblock:**
1. Capture a real Typeform webhook payload from production (open Make scenario `4653306` execution log → most recent successful run → copy bundle 1 input)
2. Replay the captured payload with a fresh signed signature (HMAC-SHA256 base64 over raw body, secret from Doppler `TYPEFORM_WEBHOOK_SECRET`)
3. Use `event_key` field in `hidden:{}` to make the test traceable (Typeform supports hidden fields per existing convention)
4. Verify tri-write
5. OR (alternate path): wait for natural production traffic, query Supabase `event_ledger WHERE source_system='typeform'` to see real-traffic evidence, then update this file based on whether real traffic produces ledger rows

**Stage-1 dependency:** Stage 1.5 (Typeform URL parameters: UTM + user_id + referrer) and Stage 1.6 (Typeform → Apollo → CIO → Linear high-score handoff) directly depend on Typeform surface working. Typeform deferral becomes a Stage 1 blocker if production traffic doesn't naturally produce ledger evidence within the first week of Stage 1.

---

## Surface 3 — Webflow CMS webhook

**Status:** DEFERRED on scenario-contract finding + active-deployment uncertainty

**Blocker:** One scenario consumes Webflow webhooks:
- `4653351` — Webflow Review Published → Customer.io + Slack (active)

Same payload-contract issue. Webflow's webhook payload shape (`triggerType: "form_submission"` vs `"collection_item_created"` vs `"collection_item_changed"` etc.) means the BasicRouter likely branches on `triggerType` and individual branches expect specific `payload.data` shapes that aren't documented.

Additionally: Webflow webhooks signing has changed across plan tiers (v5 plan Appendix I says `X-Webflow-Signature + 300s tolerance`, but newer Webflow plans use a different scheme). Need to verify current behavior against the live `dobeu.online` site.

**Runbook to unblock:**
1. Open Webflow Designer for `dobeu.online` site (`68ea7fd0881151ae3af3ab9f`) → Site Settings → Webhooks → confirm webhook URL pointing at Make scenario `4653351`'s gateway-webhook endpoint
2. Capture a real Webflow webhook payload from Make scenario execution log (most recent run) OR trigger a real Webflow form submission
3. Replay with fresh signed signature
4. Verify tri-write

**Stage-1 dependency:** Stage 1.4 (Customer.io JS on Webflow `dobeu.online` + Framer `dobeu.dev`) depends on Webflow surface working downstream. Deferral becomes Stage 1 blocker if real-traffic evidence doesn't accumulate.

---

## Surface 4 — Customer.io egress

**Status:** DEFERRED — surface receiver scenario not yet built

**Blocker:** No Make scenario currently receives Customer.io reporting webhooks. The CIO egress receiver is owned by Stage 1.4 (CIO JS on Webflow + Framer) downstream wiring + Stage 3.1 (Linear egress + CIO transactional emails). Neither has been built.

Additionally: `CUSTOMERIO_WEBHOOK_SECRET` is NOT in the v5 plan's 12-secret Doppler list. The plan implicitly assumed CIO webhook signing was either not used or was using `RUBE_MONITOR_SECRET` as a placeholder. Reality: CIO reporting webhooks do support HMAC signing but the secret type/format is CIO-specific (`X-CIO-Signature` with `v0:` prefix per CIO docs).

**Runbook to unblock:**
1. Stage 1.4 or Stage 3.1 build creates the CIO egress receiver scenario
2. Add `CUSTOMERIO_WEBHOOK_SECRET` to Doppler `dobeu-core/prd` (NEW secret, not currently in vault)
3. Configure CIO reporting webhook in CIO admin to use the new secret + point at the new Make scenario URL
4. Fire signed test event (e.g., `email_delivered` shape with `event_key` in `data:{}`)
5. Verify tri-write

**Stage-1 dependency:** Stage 1.4 builds the receiver as part of its work. Deferral is essentially "wait for Stage 1 to materialize this surface."

---

## Surface 5 — Linear egress

**Status:** DEFERRED — User Action U7 not complete

**Blocker:** No Linear egress webhook + secret are configured. Per v5 plan Appendix O, U7 ("Create Linear egress webhook + store secret") has not been executed by user. Until U7 is done:
- No `LINEAR_WEBHOOK_SIGNING_SECRET` value in Doppler `dobeu-core/prd` (verified 2026-04-25 in vault leak — the entry exists but its value is `lin_wh_z4hF0Oi8...` which may be a placeholder, not a real Linear-issued webhook signing secret)
- No active Linear egress webhook subscription
- No Make scenario receiving Linear webhooks (Stage 3.1 owns this)

**Runbook to unblock (U7 procedure):**
1. Linear → Settings → API → Webhooks → "Create webhook"
2. Set URL to a future Stage 3.1 Make scenario gateway-webhook (or temporary placeholder for testing)
3. Subscribe to relevant events (Issue created, Issue updated, Comment created — exact list determined by Stage 3.1 design)
4. Linear generates a signing secret. Copy + paste into Doppler `LINEAR_WEBHOOK_SIGNING_SECRET` (replacing current value)
5. Stage 3.1 build creates the receiver scenario
6. Fire signed test event from a Linear UI action (e.g., create a test comment on a stub issue)
7. Verify tri-write

**Stage-1 dependency:** Stage 1.x does not directly require Linear egress — Linear is the control plane (interaction surface), and inbound writes to Linear from other systems are well-tested. Linear EGRESS (Linear notifying Make of state changes) is Stage 3 territory. Deferral does not block Stage 1.

---

## Aggregate decision

| Surface | Deferral type | Stage-1 blocker? | Unblock dependency |
|---|---|---|---|
| Stripe | Scenario doesn't exist yet | No | Stage 4.1 |
| Typeform | Scenario-contract undocumented | YES (Stage 1.5, 1.6) | Real-traffic evidence OR reverse-engineering |
| Webflow | Scenario-contract undocumented | YES (Stage 1.4) | Real-traffic evidence OR reverse-engineering |
| Customer.io egress | Receiver scenario doesn't exist; secret missing | No | Stage 1.4 build + new Doppler secret |
| Linear egress | U7 not done; receiver doesn't exist | No | Stage 3.1 |

**Two of five (Typeform, Webflow) become Stage 1 blockers if real-traffic evidence doesn't naturally accumulate within ~7 days of Stage 1 start.** That's a soft commitment — the deferral runbook for those two is "wait and see" with a re-evaluation gate.

---

## Per-surface evidence files (placeholders for future PASS captures)

When a surface clears its deferral and produces full A1 evidence, replace its placeholder file in `Implementation/stage-0-evidence/` with the full evidence (Supabase row + Linear issue + Datadog event + R2 object captures, formatted per Task 1's `surface-evidence-dlq.md` template).

- `surface-evidence-stripe.md` → currently DEFERRED entry only
- `surface-evidence-typeform.md` → currently DEFERRED entry only
- `surface-evidence-webflow.md` → currently DEFERRED entry only
- `surface-evidence-customerio-egress.md` → currently DEFERRED entry only
- `surface-evidence-linear-egress.md` → currently DEFERRED entry only

This file (`deferred-surfaces.md`) is the single source of truth for deferred-state; per-surface placeholder files reference back here.

---

## Stage 0 closeout impact

A1 acceptance criteria are **partially met**:
- DLQ surface: HMAC + variable-creation + filter-resolution PROVEN; tri-write artifacts deferred via this file
- Stripe: deferred (Stage 4.1 dependency)
- Typeform: deferred (scenario contract; ≤7-day re-evaluation post-Stage-1-start)
- Webflow: deferred (scenario contract; ≤7-day re-evaluation post-Stage-1-start)
- CIO egress: deferred (Stage 1.4 dependency + missing Doppler secret)
- Linear egress: deferred (U7 not done; Stage 3.1 dependency)

Per design R1 with explicit user override 2026-04-25: Stage 0 closes with all 6 surfaces (DLQ + 5 external) deferred-or-partial. Closure is conditional on:
- v5.1 amendment item B1-expanded captured (will be in Task 6)
- Re-evaluation gates documented (this file)
- Stage 1 explicitly aware of which deferrals could become its own blockers (Typeform + Webflow)

---

## Re-evaluation cadence

- **+7 days post-Stage-1-start:** check Supabase `event_ledger` for rows with `source_system IN ('typeform','webflow')`. If 0 rows from either: hard-block Stage 1 progression on that surface; perform reverse-engineering.
- **+14 days post-Stage-1-start:** broader review of all 5 surface deferrals; update this file with current state.
- **At Stage 4.1 build start:** Stripe deferral becomes the immediate blocker for Stage 4.1; this file's Stripe section becomes the design input.

---

*Deferred-surfaces document by Claude (Cowork session) 2026-04-25. Authoritative state for Stage 0 closeout's A1 acceptance pattern under risk-accepted execution.*
