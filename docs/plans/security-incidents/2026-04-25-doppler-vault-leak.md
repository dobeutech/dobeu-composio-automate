# Security Incident — Composio DOPPLER_SECRETS_UPDATE leaked entire vault

**Date detected:** 2026-04-25
**Date opened:** 2026-04-25 (this file)
**Severity:** Class-1 (revenue-blocker — production credentials exposed)
**Status:** RISK-ACCEPTED 2026-04-25 — owner declined rotation; safeguards in place per "Resume conditions" below. Re-evaluate at next checkpoint or if any of the leaked credentials are observed in unexpected use.
**Linear:** TBD (file class-1 issue and link here once filed)
**Discovered by:** Claude (Cowork session) during Task 1 of v5.1 amendment + Stage 0 closeout plan
**Plan reference:** `Implementation/2026-04-24-v5.1-amendment-stage0-closeout-plan.md`

---

## What happened

During execution of Task 1 (DLQ_SHARED_SECRET patch), the Composio tool `DOPPLER_SECRETS_UPDATE` was invoked to set a single secret value (`DLQ_SHARED_SECRET`) in Doppler project `dobeu-core` config `prd`. The tool's response included not just the updated secret, but the full set of all secrets in that config — every value in plaintext within the `secrets:{}` response object.

Pre-incident, a separate but related Composio Doppler quirk was already known: `DOPPLER_SECRETS_GET` returns raw values despite Doppler's `rawVisibility:"masked"` flag being set. That issue surfaced only the value of the secret being read. The `DOPPLER_SECRETS_UPDATE` defect is more severe — it leaks the entire vault on any single-secret update operation.

## Affected secrets (vault inventory)

24 production credentials in `dobeu-core/prd` are considered compromised:

| Secret name | Purpose | Source platform for rotation |
|---|---|---|
| APOLLO_MASTER_KEY | Apollo master-scope API access | Apollo admin |
| APOLLO_WEBHOOK_SECRET | Apollo webhook signing | Apollo admin |
| CF_WORKER_READ_TOKEN | Cloudflare Worker R2-read token | Cloudflare dashboard |
| DLQ_SHARED_SECRET | Internal DLQ HMAC | Generate fresh; sync to Make + CF Worker |
| GITHUB_PAT | GitHub access | GitHub Personal Access Tokens |
| INTERCOM_CLIENT_ID + CLIENT_SECRET | OAuth app credentials | Intercom Developer Hub |
| INTERCOM_PAT | Intercom personal access | Intercom Developer Hub |
| INTERCOM_WEBHOOK_SECRET (+ MAKE_INTERCOM_WEBHOOK_API_KEY duplicate) | Intercom webhook signing | Intercom Developer Hub |
| LINEAR_WEBHOOK_SIGNING_SECRET | Linear webhook signing | Linear settings |
| MAKE_API_KEY | Make.com API token | Make profile settings |
| NETLIFY_PAT | Netlify personal access | Netlify user settings |
| POSTHOG_WEBHOOK_SECRET | PostHog webhook signing | PostHog project settings |
| RUBE_MONITOR_SECRET | Rube monitoring HMAC | Rube admin (sunsets 2026-05-15 anyway) |
| SENTRY_DSN | Sentry ingest endpoint | Sentry project settings |
| STRIPE_LIVE_API_KEY | Stripe live API key (already rotated 2026-04-25 morning per separate incident) | Stripe Dashboard |
| STRIPE_WEBHOOK_SECRET | Stripe webhook signing (already remediated 2026-04-25 morning) | Stripe Dashboard |
| SUPABASE_ANON_PUBLIC | Supabase anonymous JWT | Supabase project settings |
| SUPABASE_CONNECTION_STRING | Supabase Postgres connection string with DB password | Supabase project settings |
| SUPABASE_PUBLISHABLE_KEY | Supabase publishable key | Supabase project settings |
| SUPABASE_SECRET_KEY | Supabase secret key | Supabase project settings |
| SUPABASE_SERVICE_ROLE_SECRET | Supabase service role JWT | Supabase project settings |
| SUPABASE_EVENT_LEDGER_KEY | Supabase service role for ledger writes | Supabase project settings |
| TYPEFORM_WEBHOOK_SECRET | Typeform webhook signing | Typeform admin |
| WEBFLOW_WEBHOOK_SECRET | Webflow webhook signing | Webflow Designer settings |

## Adjacent findings

1. **`NETLIFY_PROJECT_ID_USP`** in Doppler holds `e8cf44e2-089c-4f4c-8b10-1998df378cf7` — the Unique Staffing Professionals Netlify project UUID, which is in the DTS-1653 customer exclusion zone. Storing the excluded UUID in Doppler is not itself a violation (Doppler is metadata, not automation), but raises a question of why the value is needed in the secret store at all. Recommend deleting unless an active workflow needs the reference.
2. **`SENTRY_DSN`** in Doppler differs from the DSN in `CLAUDE.md`. Doppler shows `...046c9cf0...@o4510238023417856...`. CLAUDE.md shows `...5cdd23f6...@o4510942828429312...`. Two different Sentry projects/DSNs. One is stale; reconcile during rotation.

## Composio tool defect

The Composio `DOPPLER_SECRETS_UPDATE` wrapper does not properly scope its response. Until fixed at Composio:
- **DO NOT use `DOPPLER_SECRETS_UPDATE` for any sensitive secret updates.** Every call leaks the full vault.
- For single-secret updates, use Doppler dashboard UI or `doppler` CLI.
- For Composio-mediated reads, prefer `DOPPLER_SECRETS_NAMES` (returns names without values) and rely on functional E2E tests for validation.
- Open a Composio support ticket referencing this incident.

## Remediation runbook

See `Implementation/security-incidents/2026-04-25-vault-rotation-runbook.md` (sibling file).

## Resume conditions (under RISK-ACCEPTED status)

Owner (Jeremy) declined rotation 2026-04-25. Stage 0 closeout (Task 1 forward) resumes under the following standing safeguards (codified in `CLAUDE.md` Composio-first execution policy section):

**Hard bans on tool calls (added to CLAUDE.md):**
- `DOPPLER_SECRETS_UPDATE` via Composio: NEVER. Use Doppler CLI or dashboard UI for all writes.
- `DOPPLER_SECRETS_GET` via Composio: avoid except in unrecoverable circumstances. Each call surfaces a raw value despite Doppler's masked-visibility flag. Prefer `DOPPLER_SECRETS_NAMES` (names-only, no values) for existence checks.
- `DOPPLER_SECRETS_LIST` via Composio: avoid for same reason as `_GET`.

**Operational substitutions (replaces the banned tools):**
- For value reads needed by HMAC signing: have the user pull the value locally via `doppler secrets get NAME --plain --project dobeu-core --config prd` and either compute the signature locally or paste the signed-already payload back. Do not ask the user to paste raw secret values.
- For value writes: Doppler dashboard or CLI only.
- For existence checks: `DOPPLER_SECRETS_NAMES` returns the list of names without values.

**Resume conditions met (RISK-ACCEPTED path):**
- Standing safeguards above are in `CLAUDE.md` ✅ (this incident's followups apply this change)
- Future Claude sessions read this incident file at session start (CLAUDE.md adds a "session-init reads incident files" instruction)
- The DLQ_SHARED_SECRET value used by Task 1's signed test is the value ALREADY in this session's context (no new Doppler reads needed); firing Task 1's signed test does not increase exposure
- No further `DOPPLER_SECRETS_*` calls in the current Stage 0 closeout

**Conditions that re-open this incident:**
- Any of the 24 named credentials is observed in unexpected use (Stripe charge dispute, GitHub push from unknown IP, Supabase row mutation outside expected scenarios, etc.)
- Any subsequent tool call returns vault contents again — escalate immediately
- Quarterly review (next: 2026-07-25) re-evaluates risk-accepted status

## Followups beyond this incident

- File Linear class-1 issue with this incident pinned
- Add to v5.1 amendment Group B: "DOPPLER_SECRETS_UPDATE Composio defect" as another execution-fragility finding
- Add to SEC-005 (secret-scan): a check that detects accidental tool-output secret leaks in Cowork session logs
- Add to SEC-004 (secret-rotation runbook): explicit ban on Composio-mediated bulk Doppler updates
- Reconcile the two Sentry DSNs (CLAUDE.md vs Doppler) — figure out which is canonical
- Decide whether `NETLIFY_PROJECT_ID_USP` belongs in Doppler at all (recommend delete)
