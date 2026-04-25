# Stage 0A Readiness Evidence

**Date captured:** 2026-04-25
**Captured by:** Claude (Cowork session)
**Source plan:** `Implementation/2026-04-24-v5.1-amendment-stage0-closeout-plan.md` Task 0
**v5.1 design ref:** `Implementation/2026-04-24-v5.1-amendment-stage0-closeout-design.md` § Group A · A2

---

## A2 Criteria 1 — Composio connections active

Tool: `COMPOSIO_MANAGE_CONNECTIONS action=list`
Captured at: 2026-04-25 02:39 UTC

| Toolkit | Default Account ID | Status | Notes |
|---|---|---|---|
| `gmail` | `gmail_remit-myogen` (wolvesofbz@gmail.com) | active, default=true | 8 accounts attached; primary healthy |
| `googlecalendar` | `googlecalendar_phylic` | active, default=true | calendar list returned 14 calendars |
| `apollo` | `apollo_nahor-ablare` (alias `apollo_evince-palolo-v2`) | active, default=true | `healthy:true, is_logged_in:true` |
| `linear` | `linear_birth` | active, default=true | introspection probe surfaces a known CSRF-style 400 (also seen in Apr 21 checkpoint) but connection itself is `status:"active"` |

**Result:** PASS

**Linear introspection note:** `user_info` field contains `BAD_REQUEST` from Linear's CSRF guard on the probe call. This does NOT reflect a broken connection — it's a known Linear API quirk on the introspection-without-content-type call. Functional Linear writes (e.g., issue creation via `LINEAR_CREATE_LINEAR_ISSUE`) are unaffected and were proven working in Apr 21 checkpoint and earlier in this session's `list_issues` call.

---

## A2 Criteria 2 — Doppler readable

Tool: `DOPPLER_SECRETS_GET` via Composio (account `doppler_behave-agita`)
Project: `dobeu-core` · Config: `prd`
Captured at: 2026-04-25 02:39 UTC and 2026-04-25 03:05 UTC (post-remediation)

### Pre-remediation finding (2026-04-25 02:39 UTC)

`STRIPE_WEBHOOK_SECRET` returned a value beginning with `sk_live_...` — a Stripe live API key, NOT a webhook signing secret. This is a misconfiguration (wrong value under right name) AND a security exposure (live API key surfaced through tool output despite Doppler's claimed `rawVisibility: "masked"`).

**User remediation actions (completed 2026-04-25 ~02:55 UTC):**
1. Stripe live key rotated via Stripe Dashboard (`Developers → API keys → Roll`)
2. Doppler entry `STRIPE_WEBHOOK_SECRET` renamed to `STRIPE_LIVE_API_KEY` and updated with the new rotated `sk_live_...` value
3. New Doppler entry `STRIPE_WEBHOOK_SECRET` created with the actual webhook signing secret (`whsec_...`) pulled from Stripe Dashboard → Webhooks → endpoint signing secret
4. Make scenario reference scan (29 scenarios in DTS team `315584`) confirmed **0 references** to either Stripe URL, env var, or literal value — no Make scenario consumed the old name, so no Make changes needed

### Post-remediation verification (2026-04-25 03:05 UTC)

| Secret name | Value prefix | Format check |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | ✅ correct webhook signing secret format |
| `STRIPE_LIVE_API_KEY` | `sk_live_...` (different mid-suffix from pre-rotation value) | ✅ correct API key format; rotation confirmed |

**Result:** PASS

**Doppler visibility quirk noted:** Both pre- and post-remediation reads surfaced raw secret values in tool output despite the `masked` visibility flag. Going forward, prefer `DOPPLER_SECRETS_NAMES` (returns names without values) for existence checks; rely on functional E2E tests (signed webhook fires successfully) to prove value correctness rather than direct value reads. This is captured as a candidate v5.1 amendment item: replace A2 criteria 2 "DOPPLER_GET_SECRET returns non-empty value" with "DOPPLER_SECRETS_NAMES returns expected key list AND a Make scenario successfully consumes the secret end-to-end."

---

## A2 Criteria 3 — Make scenario reads secret end-to-end

**Status:** PENDING — to be satisfied by Task 1 functional test.

**Architecture finding (worth flagging in v5.1 amendment):** The Make ↔ Doppler "bridge" is not a runtime sync. Make scenarios consume secrets via Make UI scenario-level env vars (`{{env.X}}` template references). Values are populated by manual paste from Doppler, not by live Doppler-tool calls. This means A2 criteria 3 cannot be satisfied by inspecting Make blueprints alone — it needs a functional test where:

1. A Make scenario references `{{env.X}}` for some secret X
2. A signed/keyed external trigger fires the scenario
3. The scenario's downstream module produces evidence that the secret value was used correctly (e.g., HMAC verification passed → downstream side effect fired)

**Path to satisfaction:** Task 1 of the implementation plan does exactly this with `DLQ_SHARED_SECRET` in scenario `4688746`. Once Task 1 produces tri-write evidence (Supabase row + Linear issue + Datadog event + R2 object) from a signed test webhook, A2 criteria 3 is functionally proven.

---

## Make scenario inventory (DTS team `315584`)

29 total scenarios fetched via direct `GET /api/v2/scenarios?teamId=315584` on Make API. 12 active, 17 inactive/draft.

**Stripe references in any of 29 blueprints:** **0 hits** across patterns `api.stripe.com`, `STRIPE_*` env var, `sk_live_`/`sk_test_`/`whsec_` literals, `stripe` package usage, `stripe` in name/description.

**Implication for Stage 0 closeout:** the Stripe surface in Task 2.1 of the implementation plan will become a **deferred-with-runbook** entry — there is no Make scenario currently receiving Stripe webhooks (gateway-webhook scenario is built in Stage 4.1 per v5 plan Appendix K). The deferral is acceptable per design R1 (1 deferred + 4 succeeded threshold).

**Doppler-bridge consumers (env-var users):** 3 scenarios reference `{{env.X}}` patterns:
- `4688746` `dlq-master-v2` — uses `DLQ_SHARED_SECRET`, `DATADOG_API_KEY`, `DATADOG_APP_KEY`
- `4688114` `subscenario:linear-graphql-call` — uses `LINEAR_API_KEY`
- `4688646` `dlq-master-v1` (inactive) — uses `DATADOG_API_KEY`, `DATADOG_APP_KEY`

The DLQ_SHARED_SECRET reference in `4688746` is at module 2 (HMAC filter): `sha256(env.DLQ_SHARED_SECRET + ifempty(headers['x-dobeu-dlq-raw'], "")) == headers['x-dobeu-dlq-sig']`.

---

## Overall A2 status

| Criterion | Result |
|---|---|
| A2.1 Composio connections healthy | PASS |
| A2.2 Doppler readable (post-remediation) | PASS |
| A2.3 Make scenario reads secret end-to-end | PENDING (Task 1) |

Stage 0A is **conditionally complete** — A2.3 will close upon Task 1 success. Proceed to Task 1.

---

## Findings to fold into v5.1 amendment

1. **Doppler value-leak quirk:** masked-flag is cosmetic only; raw values are returned in API. Use names-only listing for existence checks; prefer functional E2E tests for correctness checks.
2. **Make ↔ Doppler is paste-not-sync:** there is no live runtime bridge; values flow Doppler → user clipboard → Make UI scenario settings. A2 criteria 3 should be reframed accordingly.
3. **Stripe surface deferred for Stage 0:** the gateway-webhook scenario doesn't exist yet; it's built in Stage 4.1. Stage 0 closeout proceeds with this as a documented deferral, not a blocker.
4. **Pre-remediation security incident:** live Stripe API key was misnamed in Doppler under `STRIPE_WEBHOOK_SECRET` and surfaced through tool output. Rotation completed; document the incident in `Implementation/security-incidents/2026-04-25-stripe-key-misnamed-doppler.md` (queue for Task 8).
