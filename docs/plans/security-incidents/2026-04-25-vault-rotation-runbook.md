# Vault Rotation Runbook (incident 2026-04-25-doppler-vault-leak)

**STATUS — 2026-04-25:** DEFERRED. Owner (Jeremy) declined rotation; risk accepted. This file is preserved as the on-the-shelf playbook to execute if/when rotation becomes warranted (any of the trigger conditions in the parent incident file's "Conditions that re-open this incident" section).

**Companion to:** `2026-04-25-doppler-vault-leak.md`
**Estimated time:** 3-4 hours of UI work, organized by source platform
**Strategy:** for each secret, rotate at the SOURCE platform first, then update Doppler via **Doppler UI or CLI** (NOT via Composio's DOPPLER_SECRETS_UPDATE — that tool is what caused the leak).

**Doppler update pattern (use ONE of these per secret, not Composio):**

```bash
# Doppler CLI (preferred — local, scoped to one secret at a time)
doppler secrets set SECRET_NAME=new_value --project dobeu-core --config prd

# OR Doppler dashboard UI (https://dashboard.doppler.com → dobeu-core → prd → edit secret)
```

**As you rotate each, check off the box.** This file is the source of truth for closeout — Stage 0 doesn't resume until all boxes are ticked.

---

## Phase 1 — Money + production data (do FIRST)

### Stripe

- [ ] **STRIPE_LIVE_API_KEY** — already rotated 2026-04-25 morning. **Re-verify nothing broke** by checking Stripe Dashboard → API keys → confirm only the new key is listed as active. No action needed unless something else is wrong.
- [ ] **STRIPE_WEBHOOK_SECRET** — already remediated 2026-04-25 morning. Same re-verification — open the webhook endpoint in Stripe Dashboard → Webhooks, click "Roll signing secret" if you want a fresh whsec_ post-leak. Update Doppler.

### Supabase (project `qdwvcrmdqweojverdmmz`)

- [ ] **SUPABASE_CONNECTION_STRING** — open https://supabase.com/dashboard/project/qdwvcrmdqweojverdmmz/settings/database → "Reset database password" → set new password → copy new connection string → update Doppler. **Note: this rotates the production DB password.** Any service connecting via this string needs the new value.
- [ ] **SUPABASE_SERVICE_ROLE_SECRET** + **SUPABASE_EVENT_LEDGER_KEY** — open https://supabase.com/dashboard/project/qdwvcrmdqweojverdmmz/settings/api → "Reset service_role key" → copy new JWT → update both Doppler entries (they appear to share the same value or are aliases).
- [ ] **SUPABASE_ANON_PUBLIC** — same API page → "Reset anon key" if available, or rotate the JWT secret which invalidates anon. If anon-key reset isn't a thing in your plan, leave as is — anon is by design public.
- [ ] **SUPABASE_PUBLISHABLE_KEY** + **SUPABASE_SECRET_KEY** — these look like Supabase's newer "publishable / secret key" model (sb_publishable_..., sb_secret_...). Same Settings → API page → rotate both.

### GitHub

- [ ] **GITHUB_PAT** — open https://github.com/settings/tokens → find the PAT (token name should hint at which one) → click "Regenerate token" → copy new value → update Doppler. **Critical:** any GitHub Action / external service consuming this PAT needs the new value or it will start failing.

### Cloudflare

- [ ] **CF_WORKER_READ_TOKEN** — open Cloudflare dashboard → My Profile → API Tokens → find the read token → "Roll" → copy new → update Doppler. If this token is bound to a Worker via `wrangler secret`, also update there.

---

## Phase 2 — Webhook signing secrets (rotate after Phase 1 settles)

For each webhook signing secret: rotate at source, paste into Doppler. After updating Doppler, the corresponding Make scenario will need its env-var update too if the scenario consumes the secret directly. (My earlier scan showed only 3 scenarios use `{{env.X}}` — the DLQ master and the linear-graphql subscenario. None consume the webhook signing secrets directly via env; those secrets are typically configured at the connection level or in scenario filter expressions.)

### Typeform

- [ ] **TYPEFORM_WEBHOOK_SECRET** — Typeform admin → Webhooks → forms `KiSz0R6o`, `tOiaf5BN`, `JQh2CtLK` → click each webhook → "Reset secret" or delete + recreate. Copy new secret → Doppler.

### Webflow

- [ ] **WEBFLOW_WEBHOOK_SECRET** — Webflow Designer → Site Settings → Apps & Integrations → Webhooks → rotate. Update Doppler. Note: this secret is currently identical to `SUPABASE_EVENT_LEDGER_KEY` in the leak — that's a coincidence-or-bug worth investigating during rotation. They should NOT share a value.

### Intercom

- [ ] **INTERCOM_CLIENT_ID** + **INTERCOM_CLIENT_SECRET** — Intercom → Settings → Apps & Integrations → Developer Hub → your OAuth app → rotate client secret. Update Doppler.
- [ ] **INTERCOM_PAT** — Developer Hub → Personal Access Tokens → revoke + create new. Update Doppler.
- [ ] **INTERCOM_WEBHOOK_SECRET** + **MAKE_INTERCOM_WEBHOOK_API_KEY** — Developer Hub → Webhooks → rotate. These two Doppler entries hold the same value (duplicate); update both. Better: collapse to one entry post-rotation.

### Apollo

- [ ] **APOLLO_MASTER_KEY** — Apollo admin → API → Master Key → rotate. **NOTE:** the leaked value `wf0h42...` looks shorter than expected (22 chars). Confirm during rotation that the new key matches Apollo's standard format. Update Doppler. Also update the Composio Apollo connection (the v5 Stage 0A.1 task).
- [ ] **APOLLO_WEBHOOK_SECRET** — Apollo admin → Webhooks → rotate. Update Doppler.

### PostHog

- [ ] **POSTHOG_WEBHOOK_SECRET** — PostHog → Project Settings → Webhooks → rotate or recreate. Update Doppler.

### Linear

- [ ] **LINEAR_WEBHOOK_SIGNING_SECRET** — Linear → Settings → API → Webhooks → existing webhook → "Generate new secret" or recreate webhook. Update Doppler. Update the Linear egress scenario when Stage 3.1 builds it.

### Make.com

- [ ] **MAKE_API_KEY** — Make → Profile → API → revoke current token (`2515d713-...`) → generate new → update Doppler. **Critical:** any external script using this token (including the Composio Make connection) needs the new value. The Composio Make connection may need to be re-authenticated after rotation.

### Netlify

- [ ] **NETLIFY_PAT** — Netlify → User Settings → Applications → Personal access tokens → revoke + create new. Update Doppler.

### Sentry

- [ ] **SENTRY_DSN** — Sentry projects don't typically rotate DSNs (they're not secrets in the traditional sense — they identify a project ingest endpoint). If concerned: create a new Sentry project, point apps at new DSN, deprecate old. **Bigger issue:** the Doppler `SENTRY_DSN` (`...046c9cf0...@o4510238023417856...`) differs from CLAUDE.md (`...5cdd23f6...@o4510942828429312...`). Reconcile: which is the canonical Dobeu Sentry org? Update CLAUDE.md or Doppler so they match.

### Rube

- [ ] **RUBE_MONITOR_SECRET** — Rube hard-sunsets 2026-05-15 (DTS-1649). Two options:
   - (a) Rotate now, even though Rube is sunsetting in 3 weeks (defense in depth)
   - (b) Skip rotation; remove from Doppler at sunset
   Recommend (a): Rube admin → API/Monitoring → rotate. Low effort, eliminates the lingering exposure.

---

## Phase 3 — Internal-only secrets (no external source)

### DLQ_SHARED_SECRET

- [ ] **DLQ_SHARED_SECRET** — already rotated and aligned across Make team variable + Doppler in Task 1's setup. The current value (`94b56aac...`) is also leaked.
   1. Generate fresh 256-bit hex via `openssl rand -hex 32`
   2. Update Make team variable via API: `PUT /api/v2/teams/315584/variables/DLQ_SHARED_SECRET` with `{value: "<new>"}` — **OR** delete + recreate
   3. Update Doppler via UI/CLI (NOT Composio): `doppler secrets set DLQ_SHARED_SECRET=<new> --project dobeu-core --config prd`
   4. Update Cloudflare Worker secret store (the Worker that signs DLQ-bound payloads): `wrangler secret put DLQ_SHARED_SECRET --env <env-name>`

---

## Phase 4 — Adjacent cleanup (do during/after rotation)

### Reconcile two Sentry DSNs

- [ ] Determine which Sentry DSN is canonical (Doppler vs CLAUDE.md)
- [ ] Update the wrong one to match
- [ ] Add a comment in CLAUDE.md noting the canonical value if it changes

### NETLIFY_PROJECT_ID_USP cleanup

- [ ] Verify no Make scenario or other automation reads `NETLIFY_PROJECT_ID_USP` from Doppler
- [ ] If unused, delete from Doppler (it's a customer-exclusion-zone identifier; storing it in the secret vault is unnecessary)
- [ ] If used: document the legitimate use case in `System-ownership/system-ownership.md` so DTS-1653 enforcement reviewers don't flag it

### Composio support ticket

- [ ] File ticket with Composio referencing `DOPPLER_SECRETS_UPDATE` returning entire vault on single-secret update. Include incident date 2026-04-25, log_id `log_PmqyElkOTcCv` (visible in this session's tool-call log).
- [ ] Add `DOPPLER_SECRETS_UPDATE` to the `do not call` list in `CLAUDE.md` execution policy section until Composio fixes the wrapper.

### Update CLAUDE.md secrets policy

- [ ] Add an explicit ban: "Never call `DOPPLER_SECRETS_UPDATE` via Composio. Use Doppler CLI or dashboard UI for all Doppler writes."
- [ ] Add: "Treat any tool-call response that includes raw secret values as an automatic incident; document and rotate the named secrets."

---

## Closure checklist

- [ ] Phase 1 complete (5 secrets) — money + DB rotated and Doppler updated
- [ ] Phase 2 complete (16 secrets) — webhook + API tokens rotated
- [ ] Phase 3 complete (1 secret) — DLQ secret rotated and aligned across Make/Doppler/Worker
- [ ] Phase 4 complete (4 cleanup items)
- [ ] `DOPPLER_SECRETS_NAMES` probe confirms all expected keys still present (count should match pre-leak)
- [ ] One functional E2E test against any HMAC-verifying scenario passes with the rotated secret value (proves Doppler → Make → consumer chain still works post-rotation)
- [ ] `2026-04-25-doppler-vault-leak.md` status updated from ACTIVE to RESOLVED with closure timestamp + Linear issue ID
- [ ] Stage 0 Task 1 resumes from "execute signed test" step

---

## Order of operations rationale

**Why money + data first:** Stripe and Supabase have the highest blast radius. A leaked Stripe API key can be used to drain customer funds. A leaked Supabase service role + DB password gives full database access. Rotate these in the first hour even if the rest takes longer.

**Why webhook secrets second:** these gate downstream automation reception. While they're leaked, an attacker could forge inbound webhooks. Less catastrophic than money, but rotation closes a real attack surface.

**Why internal secrets last:** DLQ_SHARED_SECRET is internal-only; an attacker would need to already be inside the system to use it. Lower priority but still rotate.

**Why Composio support ticket separate:** rotation closes the immediate exposure. The Composio defect is the systemic fix that prevents recurrence. Both must happen, but rotation can't wait on Composio's response time.
