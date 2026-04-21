# Dobeu-Eco v5 — Final Consolidated Execution Plan (Sign-Off)

**Status:** AWAITING USER SIGN-OFF
**Version:** v5.0 (consolidates Claude v4 + Claude v4.1 addendum + OpenAI Codex review + Gemini CLI reviews)
**Date:** 2026-04-20
**Supersedes:** `v4-execution-plan.md`, `v4.1-review-addendum.md` (kept as decision-ledger source). Preserves: `v4-scenario-health-audit.md`, `v4-architecture-diagrams.md`, `v4-framer-head-snippet.html`, `v4-framer-head-snippet-docs.md`.
**Reviewer consensus:** 4-way synthesis from 3 Claude agents (architect, security-reviewer, api-designer) + OpenAI Codex (independent dissent) + Gemini CLI (tactical additions). Net: 4 of 6 architectural decisions favor Codex structural rework; all tactical security + API contract picks accepted.

---

## Executive verdict

**Q1=B survives only as Linear-as-interaction-surface, not as source-of-truth.** Processing-state authority moves to a Supabase `event_ledger` table and R2 payload archive. This resolves the semantic contradiction Codex flagged while preserving every Linear-centric write-back the user directed.

Four structural changes adopted from Codex:
1. **Inverted control model** — Linear = control plane + tasking surface; R2 = authoritative payload archive; Supabase `event_ledger` = processing state (not Make Data Stores).
2. **Cloudflare Worker selective, not universal** — only Stripe, Apollo, Customer.io high-volume, and Exclusion Zone enforcement ingress points get the Worker. Other webhooks hit Make directly with inline idempotency against the ledger.
3. **Stage 0 split into 3 independent gates** — 0A (auth/secrets), 0B (infra primitives), 0C (observability). Stage 1 unblocks on 0A complete + 0B minimum (ledger + R2 + DLQ live). No monolithic "finish 11 things" gate.
4. **Stripe Kickoff Kit as saga, not parallel fan-out** — 6 sequential steps with compensation + operator resume. Parallelism only for idempotent enrichment (Apollo lookup, Pinecone embed, PostHog identify).

Two cross-cutting new adoptions from Gemini:
5. **PII_SCRUB subscenario** (`SEC-001-pii-scrub`) runs before every Linear write. Regex + LLM (Claude Haiku) hybrid. Scrubs email/phone/SSN/cards/IPs/addresses/session IDs/Stripe IDs/revenue figures/full names.
6. **Exclusion Zone codified as `EXCLUSION_ZONE_JSON` Doppler secret** consumed by mandatory preflight subscenario `SEC-002-exclusion-zone-check` + pre-commit hook in canonical repo + Datadog monitor + failure-domain map.

Rube hard sunset 2026-05-15 is preserved as external deadline; internal cutover is **conditional** (auths stable + ledger live + DLQ live + 7 days clean staging flows), not calendar-driven.

**Scope reduction per Codex recommendation 8:** first wave focuses on **5 core domains** — `dobeu.dev` (Framer), `dobeu.online` (Webflow), Stripe checkout, Linear control plane, Customer.io lifecycle. Remaining 12 domains deferred to v5.1 after the 5-core backbone is boring.

---

## Outlined table of contents

- [0. Stage 0 — Three parallel gates](#stage-0)
  - [0A · Auth, secrets, scopes, env parity](#stage-0a)
  - [0B · Infra primitives (ledger, R2, DLQ, Worker selective)](#stage-0b)
  - [0C · Observability + docs + cleanup + health pulse](#stage-0c)
- [1. Stage 1 — Core 5-domain orchestration](#stage-1)
- [2. Stage 2 — Debt + scenario modernization](#stage-2)
- [3. Stage 3 — Bidirectional sync + GraphQL + DLQ](#stage-3)
- [4. Stage 4 — New automation families (saga-native)](#stage-4)
- [5. Stage 5 — Rube conditional cutover](#stage-5)
- [6. Stage 6 — RAG brain sync + domain expansion (v5.1)](#stage-6)
- [Appendix H — Subscenario contracts](#appendix-h)
- [Appendix I — HMAC prescriptive list](#appendix-i)
- [Appendix J — Event ledger schema (Supabase)](#appendix-j)
- [Appendix K — Stripe Kickoff saga steps](#appendix-k)
- [Appendix L — Security scenarios (SEC-001..005)](#appendix-l)
- [Appendix M — Exclusion Zone failure-domain map](#appendix-m)
- [Appendix N — Decision ledger (plan-vs-reviewer overrides)](#appendix-n)
- [Appendix O — User actions required](#appendix-o)

Preserved from v4 (unchanged; referenced): Appendix A (84-slug Composio catalog), B (24-scenario inventory), C (12-hook inventory), D (slug→stage index — to be regenerated from Appendix H), E (Exclusion Zone — now folded into Appendix M), F (Browser-verification — narrowed per Codex), G (5-class taxonomy — Linear interaction only now).

---

<a id="stage-0"></a>
## Stage 0 — Three parallel gates

Eliminates the v4 monolithic Stage 0. Gates run independently where possible; only 0A + minimum-viable 0B block Stage 1.

<a id="stage-0a"></a>
### Stage 0A — Auth, secrets, scopes, env parity (blocks Stage 1)

Owner: user actions U1-U8 + agent automation where possible.

| Task | Description | Blocks | Owner |
|---|---|---|---|
| 0A.1 | Rotate Apollo master key in Apollo admin; update Doppler `APOLLO_MASTER_API_KEY` + Composio `apollo` + Make connection 4526971 | Stage 4.1, 4.2 | user |
| 0A.2 | Populate Doppler with 12 secrets (expanded from v4.1 list): `STRIPE_WEBHOOK_SECRET`, `TYPEFORM_WEBHOOK_SECRET`, `INTERCOM_WEBHOOK_SECRET`, `APOLLO_WEBHOOK_SECRET`, `POSTHOG_WEBHOOK_SECRET`, `LINEAR_WEBHOOK_SIGNING_SECRET`, `WEBFLOW_WEBHOOK_SECRET`, `RUBE_MONITOR_SECRET`, `CF_WORKER_READ_TOKEN`, `SENTRY_DSN`, `APOLLO_MASTER_API_KEY`, `EXCLUSION_ZONE_JSON` | all Stage 4 | user |
| 0A.3 | Google OAuth reauth for connection 4526466 (Gmail refresh token invalid) | Stage 0.10 Wave A | user via Make UI |
| 0A.4 | Create calendar-scoped Google OAuth for 4688120 | Stage 0.10 Wave B + Stage 5 cutover | user via Make UI |
| 0A.5 | **Doppler reauth gate (Gemini addition 0.11.a)** — reconnect Composio `doppler` + `doppler_secretops` connections (stale per chk-20260420) | all Stage 4 secret lookups | user via Composio |
| 0A.6 | Audit + rotate `dobeu-master.env` on Drive (3.8 KB). Run `trufflehog` + `gitleaks` against: Chat-Transcript/*, sysprodprompt*.md, checkpoint-*.md | all production scenarios | agent + user rotate |
| 0A.7 | Check Intercom admin → Developer Hub → Webhooks → enable SHA256 signing. Rotate `INTERCOM_WEBHOOK_SECRET` if >90 days old | Stage 4.3 | user |
| 0A.8 | Create Linear egress webhook + secret; store as `LINEAR_WEBHOOK_SIGNING_SECRET` in Doppler | Stage 3.1 | user + agent |
| 0A.9 | Decide Kickoff Kit pricing tiers for Stage 4.1 saga branch logic (subscription / one-time / setup-mode) | Stage 4.1 | user |

**0A gate:** exit when Doppler audit log shows all 12 secrets present + all 4 Make connections (Gmail, Google calendar-scoped, Apollo master, Linear) report healthy via `COMPOSIO_MANAGE_CONNECTIONS action=list`.

<a id="stage-0b"></a>
### Stage 0B — Infra primitives (Stage 1 unblocks on 0B minimum)

Minimum-viable 0B for Stage 1: ledger table live + R2 bucket live + DLQ scenario live. Everything else in 0B runs after or in parallel with Stage 1.

**0B minimum:**
- **0B.1 — Supabase `event_ledger` table.** Per Appendix J. Apply migration to `dobeu-ecosystem` project. Create service role key, store in Doppler `SUPABASE_EVENT_LEDGER_KEY`. Verify RLS policy.
- **0B.2 — R2 bucket `dobeu-webhook-archive`.** Versioning on; lifecycle rule 400 days; private ACL; AES-256 + envelope encryption. Deploy `r2-signer` Worker with Cloudflare Access JWT for signed-URL egress (15-min TTL). Verify via test PUT/GET with signed URL.
- **0B.3 — DLQ master scenario + `[Ops] Automation Failures` Linear project.** Build Make master-DLQ scenario (triggered via subscenario 4688116). Creates Linear issues in Ops project with class/3-exception, deduplicates via `event_ledger.event_key`, attaches R2 deep link.

**0B full (after 0B minimum, parallel with Stage 1 or later):**
- 0B.4 — Cloudflare Worker `webhook-archive.dobeu.workers.dev` deployed in shadow mode for 7 days, then cutover for **Stripe only first**. Fail-open to direct Make URL on R2 write error. Self-monitor via Datadog synthetic (0C.2).
- 0B.5 — Expand Worker to Apollo, Customer.io high-volume, Exclusion Zone enforcement (only after Stripe shadow-run green).
- 0B.6 — Refactor subscenario 4688114 off `{{env.LINEAR_API_KEY}}` onto connection 4727177 (per Appendix H contract).
- 0B.7 — Commit 5 Wave 2 blueprints to canonical repo `dobeutech/dobeu-composio-automate/backups/make/blueprints/`. Sanitize per v4 0.2.
- 0B.8 — Deprecate 4652193 (superseded by 4688120). 30-day rollback window.
- 0B.9 — Rebuild 4653969 Daily Brand Analytics OR absorb into 4653899 Weekly Digest (decide after 0B.4 green).
- 0B.10 — PostHog orphan hook 2671046: drain 10 queued payloads to R2 via `SEC-003-dsar-handler` path, then attach to Stage 4.4 scenario.
- 0B.11 — Stripe webhook rebuild: new gateway-webhook in Make subscribing to 9 Stripe events (per §4 contract). Worker fronts this one first as the pilot ingress.

<a id="stage-0c"></a>
### Stage 0C — Observability + docs + cleanup (parallelizable with Stage 1)

- **0C.1 — Drive mirror sync (Q5 policy)** — push 4 new Implementation/* files + updated CLAUDE.md to Drive `/dobeu-eco/Implementation/`. Manual now; `Stage 4.5` automates going forward.
- **0C.2 — Automation Health Pulse (Gemini 0.12)** — minimal Make scenario fires daily, runs `GET_CURRENT_USER` equivalent against 10 core toolkits (Stripe, Apollo, Linear, Customer.io, Airtable, Webflow, Intercom, Datadog, Google Drive, PostHog). Class-5 heartbeat writes to parent issue `DTS-SYS-HEALTH` via subscenario 4688121.
- **0C.3 — Canary Payload for Datadog Synthetics (Gemini)** — synthetic test POSTs a payload with header `x-dobeu-canary: true` to each active webhook URL. Worker routes it to R2 `canary/` folder instead of production path. Verifies full E2E write path (Worker → R2 → Make → ledger) without producing Linear issues.
- 0C.4 — `v4-scenario-health-audit.md` execution (24 scenarios, Waves A-D; auth-dependent waves gated on 0A.3 + 0A.4).
- 0C.5 — Apollo connection 4526971 key swap verification (confirm master-scope active, rename connection label).
- 0C.6 — CLAUDE.md amendments (already completed this session).
- 0C.7 — New docs: `Implementation/exclusion-zone-failure-map.md` (Appendix M), `Implementation/secret-rotation-runbook.md`, `Implementation/subscenario-contracts.md` (Appendix H).

---

<a id="stage-1"></a>
## Stage 1 — Core 5-domain orchestration

**Scoped to 5 domains per Codex recommendation 8:** `dobeu.dev` (Framer), `dobeu.online` (Webflow), Stripe checkout path, Linear control plane, Customer.io lifecycle. Remaining 12 domains ride in Stage 6 (v5.1).

- **1.1 — Composio connection activation matrix** — only for 5-domain tools (not all 14 Tier-1). Run `COMPOSIO_MANAGE_CONNECTIONS action=list` + activate where needed. Record in new Airtable table `Connection Registry`.
- **1.2 — Sentry → Datadog → Linear pipeline** — unchanged from v4 Stage 1.2. Sentry DSN from Doppler (already redacted). Datadog Issue Template `@linear-critical-incident` with `priority-mod/revenue-blocker`.
- **1.3 — Datadog Synthetic + Canary Payload** — 4 targets: Stripe webhook, Typeform x3, +canary-payload variant per 0C.3.
- **1.4 — Customer.io JS on Webflow `dobeu.online` + Framer `dobeu.dev`** — uses the head snippet already produced (`v4-framer-head-snippet.html`). Webflow equivalent as sibling file `v4-webflow-head-snippet.html` (TODO — Stage 1 deliverable). Unified event name: `brand_signup` with `surface` trait.
- **1.5 — Typeform URL parameters** — unchanged from v4 (add UTM + user_id + referrer to 3 forms: `KiSz0R6o`, `tOiaf5BN`, `JQh2CtLK`).
- **1.6 — Typeform → Apollo → Customer.io → Linear high-score handoff** — **amended:** idempotency via label `typeform-response:<id>` not description text search (Finding 2.7). PII_SCRUB subscenario (`SEC-001`) runs before Linear write. Apollo enrichment logged to `event_ledger` with `source_system='typeform'`.

---

<a id="stage-2"></a>
## Stage 2 — Debt + scenario modernization

Unchanged from v4 Stage 2 except:
- **2.1 Tier-4 deprecation** — HubSpot + Pipedrive + Asana only. Intercom kept (user answer B). MS Teams kept (user answer A).
- **2.2 MS Teams 4653925** — fix 14% error rate via Azure AD connection monitoring (Claude Finding 2.12). Datadog monitor on connection 4528472 expiry + calendar reminder 2026-06-15 for reauth review.
- **2.3 Scenario modernization** — 4654165, 4652181, 4458602, 4653351 per v4 Stage 2.3.
- **2.4 Airtable narrow-scope** — keep ops + CRM, deprecate passive-router only.
- **2.5 Composio Remote Workbench Tier 3 weekly polls** — unchanged.

---

<a id="stage-3"></a>
## Stage 3 — Bidirectional sync + GraphQL + DLQ

- **3.1 Linear egress webhooks** — **amended for v5:** receiver first module HMAC-verify against `LINEAR_WEBHOOK_SIGNING_SECRET` using `x-hub-signature-256`. Fail-closed reject before Switch/Router. Egress events trigger Customer.io transactional emails + Airtable Sales CRM deal stage sync only.
- **3.2 Advanced GraphQL in Make HTTP** — amended: use subscenario 4688114 per Appendix H contract with `errors[]` parse + schema version check.
- **3.3 DLQ** — already partially in 0B.3 as minimum-viable. Stage 3.3 expands: per-family error budgets (Finding 2.14), circuit breaker at >N 429s/hr per source (Finding 2.13), DLQ writes on a *separate* Linear API key with its own complexity budget.
- **3.4 Integration handoff runbook v4** — markdown-to-docx; includes Appendices H-N.

---

<a id="stage-4"></a>
## Stage 4 — New automation families (saga-native)

All Stage 4 scenarios follow saga pattern (no parallel fan-out for primary state). `COMPOSIO_MULTI_EXECUTE_TOOL` permitted only for enrichment steps that are idempotent + independent.

- **4.1 Stripe Kickoff Kit — saga** — see Appendix K for 6-step contract. 9 event subscriptions per §4. `mode=payment` async (SEPA) gated on `payment_intent.succeeded`, not `.completed`. `mode=setup` persists ledger only, no Kickoff. `charge.refunded` triggers compensation in reverse.
- **4.2 Apollo reply → Airtable CRM** — saga pattern: ledger insert → Airtable Contact upsert → Activity row → class-1 Linear issue if sentiment=hot-lead. PII_SCRUB before Linear write.
- **4.3 Intercom tagged → Linear** — **amended:** HMAC header `X-Hub-Signature-256` (SHA256) preferred, fallback `X-Hub-Signature` (SHA1); user action 0A.7 enables SHA256 in Intercom admin. Idempotency key includes `tag_event_ts` for re-tag edge case.
- **4.4 PostHog spike → PagerDuty + Linear** — **amended:** PagerDuty slug is `PAGERDUTY_SEND_V2_EVENT` (not `CREATE_INTEGRATION_FOR_SERVICE` — Finding 1.12). Drains 10 orphan payloads from 0B.10.
- **4.5 Drive mirror runtime (Q5 enforcement)** — PostToolUse hook writes file manifest to Worker (not direct to Make — v4.1 Finding 3.3). Exclude list: `*.env*`, `*.pem`, `*.key`, `secrets.*`, `.doppler/`, `~$*`, `Thumbs.db`. Pre-upload trufflehog scan blocks on hit.
- **4.6 Rube parallel-run monitoring** — weekly compare with class-4 milestone write-back (Gemini) to DTS-1654 after each pass.
- **4.7 (NEW — Gemini) RAG Brain Sync** — weekly Composio Remote Workbench cell ingests `Implementation/` + `System-ownership/` + latest checkpoint into Pinecone `unified-ai` index. Ensures future agent sessions don't re-discover plan from scratch.

---

<a id="stage-5"></a>
## Stage 5 — Rube conditional cutover

**Timeline (unchanged):** 2026-05-15 Rube hard sunset.

**Cutover conditions (all must be true):**
- 0A green (all 12 Doppler secrets + 4 reauths)
- 0B minimum live (ledger + R2 + DLQ)
- 4688119 intercom-auto-close-v2 green for 10 consecutive daily fires
- 4688120 calendar-customerio-sync-v2 green for 3 consecutive 15-min fires
- Rube parallel-run weekly compare reports delta <5% for 2 consecutive weeks
- 7 days clean staging flows (Codex 7-day, narrower than Gemini 14-day because 2026-05-08 rebuild deadline leaves only 7 days before sunset)

**Cutover target date:** 2026-05-09. Backstop: 2026-05-14.

**Fallback if conditions not met by 2026-05-14:** manual operation of scenarios 4461705 + 4652193 for the gap. Do NOT extend Rube beyond 2026-05-15.

---

<a id="stage-6"></a>
## Stage 6 — RAG brain sync + domain expansion (v5.1)

Post-Stage 5. Only starts after 5-domain core is "boring" (2 weeks no Linear class-3 exceptions). Expands to remaining 12 domains one wave at a time with per-domain health pulse verification.

Scope explicitly deferred: `dobeu-at`, `dobeu-cloud`, `dobeu-icu`, `dobeu-info`, `dobeu-net`, `dobeu-org`, `dobeu-shop`, `dobeu-site`, `dobeu-store`, `dobeu-tech`, `dobeu-website`, `jeremy-live`, `jeremyw-live`. Each gets a Stage 6.x task when its time comes.

---

<a id="appendix-h"></a>
## Appendix H — Subscenario contracts

All three wrap a JSON envelope with `schema_version` (semver; breaking = major). Timeout 30s; retry 3x expo 1/3/9s; exhaust → DLQ via 4688116. Consumers MUST declare `minimum_schema_version`; child rejects older majors with `error_class:"version_mismatch"`.

### 4688114 `subscenario:linear-graphql-call`
- **In:** `{schema_version:"1.0.0", query:string, variables:object, idempotency_key:string, correlation_id:uuid}`
- **Out success:** `{ok:true, data:object, rate_limit:{remaining:int,reset:int}, correlation_id}`
- **Out error:** `{ok:false, error_class:"auth|rate_limit|validation|network|upstream|version_mismatch", error_code:string, retryable:bool, correlation_id}`

### 4688121 `subscenario:linear-write-milestone`
- **In:** `{schema_version, class:4, title, body_summary, r2_pointer?, labels[], project_id, idempotency_key, correlation_id}`
- **Out:** `{ok, issue_id, issue_identifier, created:bool, correlation_id}` | error envelope.

### 4688116 `subscenario:linear-create-exception`
- **In:** `{schema_version, class:3, source_system, event_key, error_class, error_code, r2_pointer, parent_issue?, correlation_id}`
- **Out:** `{ok, issue_id, dlq_entry_id, correlation_id}` | error envelope.

### Idempotency key pattern (single canonical)
```
event_key = sha256(source_system + ':' + external_id + ':' + event_type + ':' + schema_version)
```

For Intercom re-tag edge case: `external_id = conversation_id + ':' + tag_id + ':' + tag_event_ts`.

---

<a id="appendix-i"></a>
## Appendix I — HMAC prescriptive list

Fail-closed = reject with 401 + Datadog `webhook.hmac_failure` metric + Linear `DTS-SEC-ALERT` if >3/min.

| Source | Header | Algo | Doppler secret | Notes |
|---|---|---|---|---|
| Stripe | `Stripe-Signature` | HMAC-SHA256, timestamped | `STRIPE_WEBHOOK_SECRET` | 5-min tolerance; reject replays via `t=` |
| Typeform | `Typeform-Signature` | HMAC-SHA256, base64 | `TYPEFORM_WEBHOOK_SECRET` | Constant-time compare |
| Intercom | `X-Hub-Signature-256` preferred; `X-Hub-Signature` fallback | SHA256 / SHA1 | `INTERCOM_WEBHOOK_SECRET` | User action 0A.7 enables SHA256 |
| Apollo | `X-Apollo-Signature` | HMAC-SHA256 | `APOLLO_WEBHOOK_SECRET` | Distinct from master API key `apollo_evince-palolo` |
| PostHog | `X-PostHog-Signature` | HMAC-SHA256 | `POSTHOG_WEBHOOK_SECRET` | |
| Linear egress | `Linear-Signature` (v5) or `X-Hub-Signature-256` | HMAC-SHA256 | `LINEAR_WEBHOOK_SIGNING_SECRET` | Verify inbound egress events |
| Webflow | `X-Webflow-Signature` | HMAC-SHA256 + timestamp | `WEBFLOW_WEBHOOK_SECRET` | 300s tolerance |
| Rube monitor | `X-Rube-Signature` | HMAC-SHA256 | `RUBE_MONITOR_SECRET` | Decommission after 2026-05-15 |

Enforcement: Cloudflare Worker middleware `verifyHmac()` before downstream dispatch. For sources not behind the Worker (selective per 0B.4), verify in Make first module.

```js
// Worker pattern (preserves raw body for HMAC, fail-closed)
const hdr256 = req.headers['x-hub-signature-256'];
const hdr1   = req.headers['x-hub-signature'];
const hdr = hdr256 || hdr1;
if (!hdr) return new Response('unsigned', { status: 401 });
const algo = hdr.startsWith('sha256=') ? 'sha256' : 'sha1';
const expected = algo + '=' + crypto
  .createHmac(algo, env.INTERCOM_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
if (hdr.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(hdr), Buffer.from(expected))) {
  return new Response('invalid signature', { status: 401 });
}
```

---

<a id="appendix-j"></a>
## Appendix J — Event ledger schema (Supabase)

```sql
CREATE TABLE public.event_ledger (
  event_key          text PRIMARY KEY,
  source_system      text NOT NULL,
  event_type         text NOT NULL,
  source_object_id   text NOT NULL,
  payload_hash       text NOT NULL,
  payload_pointer_r2 text NOT NULL,
  status             text NOT NULL CHECK (status IN ('received','locked','succeeded','failed','dlq','replayed','compensated')),
  attempt_count      int  NOT NULL DEFAULT 0,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL,
  lock_until         timestamptz,
  owner_flow         text,
  result_ref         jsonb,
  error_class        text,
  error_code         text
);
CREATE UNIQUE INDEX ix_ledger_src_ext ON event_ledger(source_system, source_object_id, event_type);
CREATE INDEX ix_ledger_status_lock   ON event_ledger(status, lock_until) WHERE status IN ('locked','failed');
CREATE INDEX ix_ledger_hash          ON event_ledger(payload_hash);

-- RLS policy: service role only (no anon)
ALTER TABLE public.event_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_ledger_service_only ON public.event_ledger
  FOR ALL USING (auth.role() = 'service_role');
```

**Make scenarios hit this via `SUPABASE_EXECUTE_SQL` with service role key from Doppler `SUPABASE_EVENT_LEDGER_KEY`.**

Keep `linear_retry` as a separate Make Data Store (backoff-timer lifecycle differs per Finding 2.17).

---

<a id="appendix-k"></a>
## Appendix K — Stripe Kickoff saga steps

Sequential; `COMPOSIO_MULTI_EXECUTE_TOOL` forbidden for primary state (permitted for step 3 enrichment sub-steps only if they are independent reads).

| # | Step | Tool slug | Idempotency check | Rollback | Error class |
|---|---|---|---|---|---|
| 1 | Persist canonical kickoff event | `SUPABASE_EXECUTE_SQL` (INSERT … ON CONFLICT (event_key) DO NOTHING RETURNING) | `event_key` PK | append-only; none | `ledger_write` |
| 2 | Create Linear control issue (class 1) | `LINEAR_CREATE_LINEAR_ISSUE` via 4688121 | label `stripe-session:<cs_id>` search first | archive issue; ledger → `compensated` | `linear_write` |
| 3a | Create Drive kickoff folder | `GOOGLEDRIVE_CREATE_FOLDER` | name `kickoff-<cs_id>` search first | `GOOGLEDRIVE_TRASH_FILE` | `drive_write` |
| 3b | Create Calendar kickoff event | `GOOGLECALENDAR_CREATE_EVENT` | `iCalUID = <cs_id>@dobeu` | `GOOGLECALENDAR_DELETE_EVENT` | `calendar_write` |
| 3c | Customer.io profile + kickoff event | `CUSTOMERIO_IDENTIFY` then `CUSTOMERIO_TRACK` | `id = stripe_customer_id`, `event_id = cs_id` | `CUSTOMERIO_SUPPRESS_USER` + delete event | `cio_write` |
| 3d | Airtable Customer Pipeline row | `AIRTABLE_CREATE_RECORD` on `tbl8j3gHrIamhLIpd` | unique field `stripe_session_id` | `AIRTABLE_UPDATE_RECORD status=reverted` | `airtable_write` |
| 4 | Mark side-effects in ledger | `SUPABASE_EXECUTE_SQL` UPDATE `result_ref` jsonb per edge | per-edge key in `result_ref` | ledger UPDATE `status='compensated'` | `ledger_update` |
| 5 | Enqueue failed edges to retry | Make Data Store INSERT `linear_retry` | `(event_key, edge)` composite | 72h expiry → 4688116 DLQ | `retry_enqueue` |
| 6 | Operator resume action | Linear comment `/resume` → 3.1 egress re-fires step 3x for `status IN ('failed','locked')` edges only; reads `result_ref` to skip succeeded | ledger state | class-3 exception after 2 failed resumes | `operator_resume` |

**Compensation on `charge.refunded`:** reverse order 3d → 3c → 3b → 3a → 2, each using recorded `result_ref` IDs.

**Branch logic:**
- `mode=setup` → ledger insert only; no Kickoff
- `mode=payment` sync → gate Kickoff on `payment_intent.succeeded`
- `mode=payment` async (SEPA) → gate on `checkout.session.async_payment_succeeded`
- `checkout.session.expired` → ledger `failed/expired`, no side effects
- `invoice.payment_failed` → class-3 exception via 4688116

---

<a id="appendix-l"></a>
## Appendix L — Security scenarios (SEC-001 through SEC-005)

5 Make scenarios enforcing security posture across all of Stage 4.

| ID | Name | Trigger | Owned content |
|---|---|---|---|
| SEC-001 | `pii-scrub` | Subscenario, on-demand | Regex pass (email, E.164 phone, US SSN, credit-card PANs, IPv4/v6, USPS addresses, Stripe `cus_`/`pi_`/`ch_`, session IDs, revenue figures) + LLM pass (Claude Haiku via Composio, temp 0, structured output) for names/addresses/contextual revenue |
| SEC-002 | `exclusion-zone-check` | Subscenario, mandatory preflight before any GitHub/Netlify/Linear scenario run | Reads `EXCLUSION_ZONE_JSON` from Doppler; returns `{blocked:bool, matched:string?}`; on block emits class-3 exception + Datadog `exclusion_zone.violation_attempted` |
| SEC-003 | `dsar-handler` | On-demand, triggered by DSAR request in Linear | Queries `event_ledger` by `subject_email_hash`, generates signed R2 bundle, 30-day SLA, deletes payload on "right to erasure" request |
| SEC-004 | `secret-rotation` | Weekly cron (Sunday 02:00 UTC) | Reads Doppler secret age, writes Datadog metric `doppler.secret.age_days`, alerts at 80d (standard) / 25d (Stripe+Apollo); opens Linear milestone DTS-SEC-ROTATION for human rotation |
| SEC-005 | `secret-scan` | Weekly cron (Saturday 14:00 UTC) | Runs trufflehog + gitleaks against Drive mirror + canonical repo; files Linear class-3 exception on hit; triggers rotation via SEC-004 |

All 5 reference subscenario 4688116 for exception handling and 4688121 for milestone writes. PII_SCRUB (SEC-001) is invoked by Stage 1.6, 3.1, 4.1, 4.2, 4.3, 4.4 before any Linear write.

---

<a id="appendix-m"></a>
## Appendix M — Exclusion Zone failure-domain map

**Forbidden identifiers:**
- GitHub: `dobeutech/agent-usl-website`, alias `dobeutech/usl-agent-website`
- Netlify: `e8cf44e2-089c-4f4c-8b10-1998df378cf7`

**Layered enforcement:**

| Layer | Mechanism | Failure mode |
|---|---|---|
| 1 · Doppler JSON | `EXCLUSION_ZONE_JSON` secret | If Doppler down → SEC-002 fails closed → block all GH/Netlify/Linear scenarios |
| 2 · Subscenario | `SEC-002-exclusion-zone-check` mandatory preflight | If subscenario error → parent scenario class-3 exception |
| 3 · Pre-commit hook | `.githooks/pre-commit` at `dobeutech/dobeu-composio-automate` | Blocks commits; user bypass requires `--no-verify` + Linear issue explaining |
| 4 · Runtime client-side | Framer head snippet section 8 (already deployed) | Scrubs href at render; logs Sentry breadcrumb |
| 5 · Datadog monitor | `exclusion_zone.violation_attempted` metric | Pages DTS-1653 on any layer 2/3 hit |
| 6 · Weekly audit | SEC-005 grep Drive + repo weekly | Files Linear class-3 on any match |

**If all layers fail:** DTS-1653 is permanent + never closes + has reminder cron every 90 days.

---

<a id="appendix-n"></a>
## Appendix N — Decision ledger (plan-vs-reviewer overrides)

Every v5 decision where any of the 4 reviewers was overridden. Kept here so future sessions don't re-litigate.

| Decision | v5 choice | Override source | Why |
|---|---|---|---|
| Linear as source of truth | Linear = interaction surface only; R2+ledger = authoritative | Codex rejected Q1=B; Claude+Gemini accepted | Codex architecturally correct; user Q1=B intent preserved as "Linear is where humans interact" |
| Universal Worker pre-proxy | Selective (Stripe first, expand only after green) | Codex + user | Premature infra; SPOF; fix only if earning keep |
| Parallel fan-out for Stripe Kickoff | Sequential saga | Codex | Money-adjacent flow; split-brain onboarding state otherwise |
| 17-domain scope | 5-domain scope v5; 12 deferred to Stage 6 | Codex | Solo-founder at 15 hrs/week |
| Make Data Stores as permanent ledger | Supabase `event_ledger` table | Codex + Claude 2.17 | Querying, migration, backfill ergonomics |
| Rube cutover date | Conditional + 7 days clean staging; 2026-05-09 target, 2026-05-14 backstop | Codex + Gemini 0-Red | Calendar-driven cutover is theater when OAuth is live dependency |
| Keep Intercom | Kept | User answer B overrides Drive plan deprecation | User reconnected Intercom |
| Keep MS Teams | Kept with 4653925 debug | User answer A overrides Slack reroute | User preference |
| Scenario 4461705 | Reauth + keep | User Q-answer overrides Drive plan delete | Live scenario, not a deletion candidate |
| Scenario 4459818 | Keep (Wave 3 activation) | Override Drive plan delete | Already active in Wave 3 |
| Airtable passive-router | Deprecate passive-router only; keep ops + CRM | User intent + CLAUDE.md | CRM just built; don't undo |
| Browser-verification default | Alternate-tool read-after-write, not screenshot | Codex + Claude 2.5 | Screenshot services leak authenticated views |
| PII in Linear descriptions | PII_SCRUB subscenario before write | Gemini addition | Linear is org-searchable; scrub at boundary |
| Exclusion Zone enforcement | Doppler JSON + preflight sub + pre-commit + Datadog + runtime + weekly audit | Merge Claude 2.3 + Gemini + Codex | Defense in depth |
| Subscenario contracts | JSON Schema + semver + version_mismatch error class | Claude 2.8 + Codex versioning | Undeclared APIs are production hazard |
| 6 Make Data Stores | ONE `event_ledger` + separate `linear_retry` | Codex + Claude 2.17 | Ledger model unifies dedup + retry + audit |

---

<a id="appendix-o"></a>
## Appendix O — User actions required for sign-off

Total time: ~90 minutes across Stage 0A.

| # | Action | Blocks | Time |
|---|---|---|---|
| U1 | Apollo master key rotation → Doppler + Composio + Make 4526971 | Stage 4.1, 4.2 | 5 min |
| U2 | Populate 12 Doppler secrets (expanded list) | All Stage 4 | 20 min |
| U3 | Google OAuth reauth for connection 4526466 | Stage 0C.4 Wave A | 5 min via Make UI |
| U4 | Calendar-scoped Google OAuth for 4688120 | Stage 0C.4 Wave B + Stage 5 cutover | 10 min via Make UI |
| U5 | Reconnect Composio `doppler` + `doppler_secretops` | All Stage 4 secret reads | 10 min via Composio UI |
| U6 | Intercom → enable SHA256 signing; rotate `INTERCOM_WEBHOOK_SECRET` | Stage 4.3 | 5 min |
| U7 | Create Linear egress webhook + store secret | Stage 3.1 | 5 min |
| U8 | Decide Kickoff Kit pricing tier logic (subscription / one-time / setup) | Stage 4.1 saga branch | 10 min |
| U9 | Audit + rotate `dobeu-master.env` on Drive (3.8 KB) | Stage 4.5 runtime mirror | 5 min |
| U10 | Supabase migration: apply Appendix J DDL + create service role | Stage 0B.1 (blocks Stage 1) | 10 min |
| U11 | Cloudflare: provision R2 bucket `dobeu-webhook-archive` + deploy `r2-signer` Worker | Stage 0B.2 (blocks Stage 1) | 15 min |
| U12 | Sign off on this v5 plan + approve scope reduction to 5 domains for Stage 1 | All of Stage 1 | 15 min reading |

---

## Sign-off checklist

Approving v5 means:
- [x] Hybrid control model (Linear = interaction, Supabase ledger = authoritative) accepted
- [x] Stage 0 split into 3 parallel gates; Stage 1 gated on 0A + 0B minimum
- [x] Stripe Kickoff Kit rebuilt as saga per Appendix K
- [x] Scope reduced to 5 core domains for Stage 1-5; remaining 12 deferred to Stage 6 (v5.1)
- [x] 5 new security scenarios (SEC-001 through SEC-005) added
- [x] Supabase `event_ledger` replaces 6 Make Data Stores
- [x] Rube cutover conditional with 2026-05-09 target, 2026-05-14 backstop
- [x] Subscenario contracts (Appendix H) + HMAC list (Appendix I) + saga steps (Appendix K) sufficient for any agent to implement
- [x] 12 user actions (Appendix O) understood and scheduled

Reply **APPROVED** to trigger Session 2 execution: Stage 0A user-action runbook + 0B.1/0B.2/0B.3 minimum infra build.

Reply **MODIFY [section]** to request changes before sign-off.

Reply **REJECT** to return to v4.1 tactical path (honors Q1=B without structural rework; accepts risks Codex flagged).
