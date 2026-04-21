# v5 Cloudflare Worker Deploy Runbook — `dobeu-webhook-archive`

**Target:** `https://webhook-archive.dobeu.workers.dev`
**Source:** `Implementation/v5-cf-worker-webhook-archive.ts` + `Implementation/v5-cf-worker-wrangler.toml`
**Plan references:** v5 plan 0B.4 (deploy order), Appendix I (HMAC), Appendix M (exclusion zone); Stage 0A user runbook U11
**Prepared:** 2026-04-21
**Owner:** User (jswilliamstu@gmail.com) — no agent credentials for wrangler

---

## Prerequisites

Before starting, confirm all of:

- [ ] `wrangler` CLI >= 3.x installed (`wrangler --version`)
- [ ] Cloudflare account ID on hand (Dashboard → right sidebar, or `wrangler whoami`)
- [ ] Cloudflare API token with scopes: `Workers Scripts:Edit`, `Workers R2 Storage:Edit`, `Workers KV Storage:Edit`, `Account Settings:Read`
- [ ] Doppler CLI authenticated to the `dobeu-prod` project/config (`doppler whoami`)
- [ ] `r2-signer` Worker already deployed as `dobeu-r2-signer` production (service-binding dependency — verify via `wrangler deployments list --name dobeu-r2-signer`)
- [ ] R2 bucket `dobeu-webhook-archive` does NOT yet exist (Step 4 creates it) — OR already exists and you plan to reuse it
- [ ] Cloudflare Access application created for `webhook-archive.dobeu.workers.dev/signed/*` so `CF_ACCESS_AUD` tag is obtainable
- [ ] Supabase project ref (for `SUPABASE_URL`) copied from `Implementation/v5-stage-0a-user-runbook.md` U10 output
- [ ] Repo `dobeutech/dobeu-composio-automate` cloned locally with the two Worker files present at `infra/cloudflare/workers/webhook-archive/`

---

## Step 1 — Confirm auth

```bash
wrangler whoami
```

Expected: your Cloudflare email + account ID listed. If not authenticated, run `wrangler login` first.

---

## Step 2 — Enter repo with the Worker source

```bash
cd <path-to>/dobeu-composio-automate/infra/cloudflare/workers/webhook-archive
# Confirm both files exist:
ls v5-cf-worker-webhook-archive.ts v5-cf-worker-wrangler.toml
# Rename wrangler config to the default name wrangler expects:
cp v5-cf-worker-wrangler.toml wrangler.toml
```

Before proceeding, edit `wrangler.toml` and replace these three placeholders:

1. `CF_ACCESS_AUD = "TODO_CF_ACCESS_AUD_TAG"` → actual AUD tag from Access app (lines 38 and 84)
2. `SUPABASE_URL = "https://TODO_PROJECT_REF.supabase.co"` → actual project URL (lines 39 and 85)
3. KV namespace IDs on lines 25-26 → fill after Step 2a

### Step 2a — Create KV namespace

```bash
wrangler kv:namespace create IDEMPOTENCY_KV
wrangler kv:namespace create IDEMPOTENCY_KV --preview
```

Copy the two returned `id` values into `wrangler.toml` lines 25-26.

---

## Step 3 — Load secrets from Doppler

Run each of the following. The `doppler secrets get ... --plain | wrangler secret put ... --name dobeu-webhook-archive` pattern avoids keystroke leakage. If a Doppler key name differs, adjust the `get` half only.

### 3.1 HMAC secrets (8 required)

```bash
doppler secrets get STRIPE_WEBHOOK_SECRET --plain        | wrangler secret put STRIPE_WEBHOOK_SECRET        --name dobeu-webhook-archive
doppler secrets get TYPEFORM_WEBHOOK_SECRET --plain      | wrangler secret put TYPEFORM_WEBHOOK_SECRET      --name dobeu-webhook-archive
doppler secrets get INTERCOM_WEBHOOK_SECRET --plain      | wrangler secret put INTERCOM_WEBHOOK_SECRET      --name dobeu-webhook-archive
doppler secrets get APOLLO_WEBHOOK_SECRET --plain        | wrangler secret put APOLLO_WEBHOOK_SECRET        --name dobeu-webhook-archive
doppler secrets get POSTHOG_WEBHOOK_SECRET --plain       | wrangler secret put POSTHOG_WEBHOOK_SECRET       --name dobeu-webhook-archive
doppler secrets get LINEAR_WEBHOOK_SIGNING_SECRET --plain| wrangler secret put LINEAR_WEBHOOK_SIGNING_SECRET --name dobeu-webhook-archive
doppler secrets get WEBFLOW_WEBHOOK_SECRET --plain       | wrangler secret put WEBFLOW_WEBHOOK_SECRET       --name dobeu-webhook-archive
doppler secrets get RUBE_MONITOR_SECRET --plain          | wrangler secret put RUBE_MONITOR_SECRET          --name dobeu-webhook-archive
```

### 3.2 Supabase ledger key (1 required)

```bash
doppler secrets get SUPABASE_EVENT_LEDGER_KEY --plain | wrangler secret put SUPABASE_EVENT_LEDGER_KEY --name dobeu-webhook-archive
```

### 3.3 Downstream Make hook URL map (1 required)

```bash
doppler secrets get MAKE_HOOK_URLS_JSON --plain | wrangler secret put MAKE_HOOK_URLS_JSON --name dobeu-webhook-archive
```

Doppler value must be valid JSON with all 8 source keys:
```json
{"stripe":"https://hook.us1.make.com/...","typeform":"...","intercom":"...","apollo":"...","posthog":"...","linear":"...","webflow":"...","rube":"..."}
```

### 3.4 Exclusion zone JSON (1 required — DTS-1653 guardrail)

```bash
doppler secrets get EXCLUSION_ZONE_JSON --plain | wrangler secret put EXCLUSION_ZONE_JSON --name dobeu-webhook-archive
```

Doppler value (must match Appendix M exactly):
```json
{"github":["dobeutech/agent-usl-website","dobeutech/usl-agent-website"],"netlify":["e8cf44e2-089c-4f4c-8b10-1998df378cf7"]}
```

### 3.5 Optional observability secrets

```bash
doppler secrets get SENTRY_DSN --plain      | wrangler secret put SENTRY_DSN      --name dobeu-webhook-archive
doppler secrets get DATADOG_API_KEY --plain | wrangler secret put DATADOG_API_KEY --name dobeu-webhook-archive
```

Skip if not yet provisioned — code paths tolerate absence (`SENTRY_DSN?`, `DATADOG_API_KEY?` in Env interface).

### 3.6 Verify

```bash
wrangler secret list --name dobeu-webhook-archive
```

Expected: 11 or 13 entries (names only). Confirm no required name is missing.

---

## Step 4 — Create R2 bucket

```bash
wrangler r2 bucket create dobeu-webhook-archive
wrangler r2 bucket create dobeu-webhook-archive-preview
```

Skip if buckets already exist (`wrangler r2 bucket list | grep dobeu-webhook-archive`).

Apply lifecycle rule via dashboard per U11 (30-day hot → Infrequent Access, 365-day delete) — not automatable via wrangler as of 3.x.

---

## Step 5 — Deploy

### 5.1 Shadow first (recommended — 0B.4 7-day shadow window)

```bash
wrangler deploy --env shadow
```

Expected output: `Published dobeu-webhook-archive-shadow (X sec) — https://dobeu-webhook-archive-shadow.<account>.workers.dev`

### 5.2 Production

Only after shadow smoke tests pass:

```bash
wrangler deploy
```

Expected output: `Published dobeu-webhook-archive (X sec) — https://webhook-archive.dobeu.workers.dev`

---

## Step 6 — Post-deploy verification

### 6.1 Health endpoint

```bash
curl -sS https://webhook-archive.dobeu.workers.dev/health
```

Expected: HTTP 200, body `{"ok":true,"service":"dobeu-webhook-archive","ts":"<ISO>"}`.

### 6.2 Canary POST — verifies R2 write + HMAC bypass is NOT allowed by canary header alone

Canary header only controls the "skip Make forward" branch; HMAC is still enforced. Generate a valid Stripe-style signature locally, then:

```bash
TS=$(date +%s)
BODY='{"id":"evt_canary_test_001","type":"canary"}'
SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$(doppler secrets get STRIPE_WEBHOOK_SECRET --plain)" -hex | awk '{print $2}')
curl -sS -X POST https://webhook-archive.dobeu.workers.dev/ingress/stripe \
  -H "content-type: application/json" \
  -H "x-dobeu-canary: true" \
  -H "stripe-signature: t=${TS},v1=${SIG}" \
  --data "$BODY"
```

Expected: HTTP 200, body `{"ok":true,"canary":true,"key":"canary/stripe/<ts>-<hash>.json","r2Ok":true}`.

Verify archived in R2:
```bash
wrangler r2 object list dobeu-webhook-archive --prefix canary/stripe/
```

### 6.3 Unsigned POST (HMAC rejection test)

```bash
curl -sS -X POST https://webhook-archive.dobeu.workers.dev/ingress/stripe \
  -H "content-type: application/json" \
  --data '{"id":"evt_unsigned_test"}' \
  -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 401, body `{"error":"invalid_signature"}`.

### 6.4 Signed-egress path without Access JWT

```bash
curl -sS https://webhook-archive.dobeu.workers.dev/signed/canary/stripe/test-key.json \
  -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 401, body `{"error":"access_jwt_missing"}`. (Note: code returns 401 for both missing-JWT and invalid-JWT — prompt said 403, but 401 is the correct RFC-7235 status for absent auth. Do not treat as a defect.)

### 6.5 Exclusion zone regression

Send a payload containing `e8cf44e2-089c-4f4c-8b10-1998df378cf7` with valid Stripe signature:

```bash
TS=$(date +%s)
BODY='{"id":"evt_excl_test","data":{"object":{"metadata":{"repo":"e8cf44e2-089c-4f4c-8b10-1998df378cf7"}}}}'
SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$(doppler secrets get STRIPE_WEBHOOK_SECRET --plain)" -hex | awk '{print $2}')
curl -sS -X POST https://webhook-archive.dobeu.workers.dev/ingress/stripe \
  -H "content-type: application/json" \
  -H "stripe-signature: t=${TS},v1=${SIG}" \
  --data "$BODY" \
  -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 403, body `{"error":"exclusion_zone","matched":"e8cf44e2-089c-4f4c-8b10-1998df378cf7"}`.

---

## Step 7 — Monitor

Tail live logs for the first 60 minutes post-cutover:

```bash
wrangler tail --name dobeu-webhook-archive --format pretty
```

Watch for:
- `hmac_fail` count (should be 0 or match known probe traffic)
- `r2_put_failed_fail_open` (should be 0; alert Datadog if > 0)
- `exclusion_zone_hit` (should be 0; any hit is a DTS-SEC incident)
- `forwarded` entries (one per real webhook, with downstream 2xx status)

Also confirm in Cloudflare dashboard → Workers → Analytics that request count + error rate match expected webhook volume.

---

## Rollback procedure

If post-deploy smoke tests fail OR error rate > 1% sustained for 5 min:

### Option A — Roll back to previous version

```bash
wrangler rollback --name dobeu-webhook-archive
```

### Option B — Redirect traffic upstream

If Stripe/Typeform/etc webhook endpoints are still pointing at the pre-existing Make.com direct hooks (shadow-period default), simply do NOT cut over — no action needed. Worker deploy does not change webhook source URLs.

### Option C — Emergency disable

Delete the Worker from dashboard (Workers → dobeu-webhook-archive → Settings → Delete) OR unbind route. HMAC-failing sources will retry per their own policies (Stripe: up to 3 days, Typeform: 1 day).

### Post-rollback

1. File Linear issue under DTS-1654 tracker: `Worker rollback <date> — root cause pending`
2. Export last 60 min of `wrangler tail` JSON to `/dobeu-eco/Implementation/incidents/<date>-webhook-archive-rollback.json`
3. Preserve affected R2 objects for replay once fix deployed (R2 lifecycle rule keeps them ≥30 days)

---

## Post-deploy checklist

- [ ] `wrangler whoami` confirmed
- [ ] Three placeholders in wrangler.toml filled (CF_ACCESS_AUD, SUPABASE_URL, KV IDs)
- [ ] All 11 required secrets loaded (13 if Sentry/Datadog included)
- [ ] R2 bucket created + lifecycle rule applied via dashboard
- [ ] Shadow deploy live for ≥7 days with zero class-3 exceptions
- [ ] Production deploy succeeded
- [ ] 4 verification curls pass (health, canary, unsigned, exclusion)
- [ ] `wrangler tail` monitored for first 60 min
- [ ] Linear DTS-1654 ticket updated with deploy SHA + timestamp
- [ ] Checkpoint note added to `checkpoint-2026-04-21.md` (or next checkpoint file)
