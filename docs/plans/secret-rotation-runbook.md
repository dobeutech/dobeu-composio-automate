# Secret Rotation Runbook

**Status:** General-purpose operational guide for SEC-004 automated alerts

**Date:** 2026-04-25  
**Scope:** Webhook signing secrets, API keys, OAuth refresh tokens  
**Not included:** The Doppler-specific incident runbook (see `Implementation/security-incidents/2026-04-25-vault-rotation-runbook.md` for incident-response details)

**Doppler safeguard reference:** All Doppler updates MUST use Doppler dashboard UI or `doppler` CLI, **NEVER** `DOPPLER_SECRETS_UPDATE` via Composio (per `CLAUDE.md` § Doppler-via-Composio bans, incident 2026-04-25-doppler-vault-leak).

---

## When SEC-004 Alerts

**Datadog metrics trigger Linear milestone DTS-SEC-ROTATION:**

| Threshold | Secret class | Action |
|---|---|---|
| Secret age ≥ 80 days | Standard (webhook, most API keys) | Milestone opened; class-4 priority |
| Secret age ≥ 25 days | **Stripe webhook secret + Apollo master key** | Milestone opened; class-3 priority (early warning) |
| Secret age ≥ 365 days | Any | Class-2 incident; escalate to Anthropic Infra |

**Linear milestone `DTS-SEC-ROTATION` arrives with:**
- List of secrets requiring rotation + current age in days
- Label: `class/rotation-required`
- Assignment: ops owner
- Links to this runbook (section 2a-2e for relevant class)

**Your task:** follow the rotation procedure for the applicable secret class (§2a, 2b, or 2c), then close the milestone.

---

## Rotation Procedure per Secret Class

### 2a — Webhook Signing Secrets

**Affected secrets:** `STRIPE_WEBHOOK_SECRET`, `TYPEFORM_WEBHOOK_SECRET`, `INTERCOM_WEBHOOK_SECRET`, `APOLLO_WEBHOOK_SECRET`, `POSTHOG_WEBHOOK_SECRET`, `WEBFLOW_WEBHOOK_SECRET`, `LINEAR_WEBHOOK_SIGNING_SECRET`, `RUBE_MONITOR_SECRET`

**Rotation steps:**

1. **Source-platform rotation** (where webhook endpoints are configured):
   - **Stripe** (Dashboard → Developers → Webhooks): click your webhook endpoint → Signing secret → Rotate. Copy the **new** secret.
   - **Typeform** (Settings → Webhooks): edit webhook → regenerate signing secret
   - **Intercom** (Settings → Developer Hub → Webhooks): click webhook → rotate signing secret (user action 0A.7 must have enabled SHA256)
   - **Apollo** (Settings → Webhook configuration): rotate signing key
   - **PostHog** (Project settings → Webhooks): regenerate secret
   - **Webflow** (Project settings → Webhooks): regenerate signing secret
   - **Linear** (Workspace settings → API → Webhooks): regenerate webhook secret
   - **Rube** (Rube admin dashboard): rotate monitor secret

2. **Update Doppler** (Doppler dashboard or CLI, NOT Composio):
   ```bash
   # Via CLI (single secret):
   doppler secrets set STRIPE_WEBHOOK_SECRET='<new_secret_value_from_platform>'  \
     --project dobeu-core --config prd
   
   # Via dashboard: Settings → dobeu-core (prd) → Secrets → STRIPE_WEBHOOK_SECRET → Update value
   ```

3. **Wait 5 minutes** for Doppler cache TTL to expire.

4. **Test with a signed webhook:**
   - Trigger a test event from the source platform (e.g., Stripe test charge, Typeform test submission)
   - Monitor Make scenario logs: the webhook should arrive and HMAC verification should pass
   - Check Datadog `webhook.hmac_failure` metric — should remain 0
   - If 401 failures appear: revert Doppler update and re-check the secret value (common cause: copy-paste error or platform returned a different format)

5. **Document rotation:**
   - Comment on Linear milestone DTS-SEC-ROTATION: "Rotated: STRIPE_WEBHOOK_SECRET (old age: 92d, new age: 0d, platform: Stripe)"
   - Example comment:
     ```
     Rotated: STRIPE_WEBHOOK_SECRET
     - Old age: 92 days
     - New age: 0 days (rotated 2026-04-25 14:30 UTC)
     - Platform: Stripe Dashboard → Developers → Webhooks → [endpoint] → Signing secret
     - Doppler updated via CLI
     - Signed test webhook verified successfully
     ```

6. **Close the milestone** once all secrets in the list are rotated and tested.

---

### 2b — API Keys (Composio Toolkits)

**Affected secrets:** `APOLLO_MASTER_API_KEY`, other API keys managed via Composio connections

**Rotation steps:**

1. **Rotate at source platform:**
   - **Apollo** (Settings → API Keys): revoke old key, create new master-scope key. Copy the new key.
   - **Other providers** (Stripe, Airtable, Webflow, etc.): follow their key rotation UI

2. **Update Doppler:**
   ```bash
   doppler secrets set APOLLO_MASTER_API_KEY='<new_key_from_platform>'  \
     --project dobeu-core --config prd
   ```

3. **Update Composio connection:**
   - Go to Composio dashboard → Connections → filter by toolkit (e.g., "Apollo")
   - Locate the connection ID (e.g., `4526971` for Apollo master)
   - Edit connection: paste new API key value
   - Save and test: run a simple action (e.g., `APOLLO_GET_CREDITS`) to confirm auth works

4. **Wait 5 minutes** for Doppler cache.

5. **Smoke test the Make scenarios** that use this connection:
   - Run a Stage 4.2 example (Apollo reply scenario) with a test payload
   - Confirm the Apollo enrichment step succeeds (check Make execution history)
   - If auth error: revert Doppler + Composio and re-check the key format

6. **Revoke old key at source platform** (if not auto-revoked):
   - Apollo: Settings → API Keys → revoke old key

7. **Document rotation:**
   - Comment on DTS-SEC-ROTATION: "Rotated: APOLLO_MASTER_API_KEY (Composio connection 4526971 updated; smoke test passed)"

---

### 2c — OAuth Refresh Tokens (Gmail, Google Calendar, Linear)

**Affected secrets:** Gmail connection refresh token, Calendar connection refresh token, Linear OAuth token

**Rotation steps:**

1. **Trigger reauth in Make:**
   - Go to Make → Connections → find the connection (e.g., "Gmail" 4526466, "Google Calendar" 4688120, "Linear" 4727177)
   - Click the connection → Reauth (or "Reconnect")
   - Browser opens OAuth consent screen; approve the requested scopes
   - Make automatically updates the refresh token; Doppler is NOT updated (OAuth is managed directly by Make/Composio)

2. **Verify the connection is healthy:**
   - Run a simple test action from that connection (e.g., `GMAIL_SEND_EMAIL` draft, or `GOOGLECALENDAR_LIST_CALENDARS`)
   - Confirm success in Make execution history
   - If auth error: the reauth may not have completed; repeat step 1

3. **Document rotation:**
   - Comment on DTS-SEC-ROTATION: "Rotated: Gmail refresh token (connection 4526466 reauthenticated via Make UI; test email send verified)"

4. **Note:** OAuth tokens are auto-refreshed by Make/Composio. Manual rotation is only needed if the refresh token expires (>6 months idle) or a security event requires forced reauth.

---

## Special Case: STRIPE_WEBHOOK_SECRET Rotation

**Extra complexity:** Stripe allows multiple webhook endpoints + per-endpoint signing secrets.

**Policy:**
- Primary gateway webhook (where most Stripe events arrive) uses `STRIPE_WEBHOOK_SECRET` in Doppler
- Secondary endpoints (e.g., Billing, Disputes) can use scenario-level env vars if they have separate signing secrets
- Rotate **primary gateway secret only** via this runbook; secondary endpoints are rotated on-demand if a scenario requires it

**Rotation steps for primary gateway:**

1. **Stripe Dashboard → Developers → Webhooks:**
   - Find your primary endpoint (typically `https://your-make-webhook.make.com/...`)
   - Click endpoint → Signing secret → Rotate
   - Copy the **new** secret

2. **Update Doppler:**
   ```bash
   doppler secrets set STRIPE_WEBHOOK_SECRET='<new_secret>'  \
     --project dobeu-core --config prd
   ```

3. **Wait 5 minutes.**

4. **Test with a real Stripe event:**
   - Use `stripe trigger payment_intent.succeeded` CLI, or trigger in dashboard
   - Verify the webhook arrives in Make with a successful HMAC signature check
   - Datadog `webhook.hmac_failure` metric should stay at 0

5. **Stripe will send both old and new secrets for a grace period** (typically 1 hour); after that, only the new secret is valid. If Make receives a webhook during the grace period, it may try both; this is expected.

6. **Comment on DTS-SEC-ROTATION:**
   ```
   Rotated: STRIPE_WEBHOOK_SECRET
   - Primary gateway endpoint updated in Stripe Dashboard
   - Doppler secret updated: 2026-04-25 14:30 UTC
   - Test payment_intent.succeeded fired and verified
   - Grace period expires: 2026-04-25 15:30 UTC (Stripe auto-reverts old key after this)
   ```

---

## Logging

**Append to file:** `Implementation/secret-rotation-log.md` (create if missing)

**Format:**
```markdown
| Date | Time (UTC) | Secret name | Old age | New age | Platform | Operator | Notes |
|---|---|---|---|---|---|---|---|
| 2026-04-25 | 14:30 | STRIPE_WEBHOOK_SECRET | 92d | 0d | Stripe Dashboard | jswilliamstu | test webhook verified |
| 2026-04-25 | 14:45 | APOLLO_MASTER_API_KEY | 85d | 0d | Apollo Settings | jswilliamstu | Composio 4526971 updated; Stage 4.2 smoke test passed |
| 2026-04-25 | 15:00 | Gmail refresh token | 120d (est.) | 0d | Make UI (4526466) | jswilliamstu | reauthenticated; test email send verified |
```

**Why logging?** Post-rotation audit trail. If a secret rotation breaks a scenario 2 weeks later, you can review the log to confirm when it was rotated and by whom.

---

## Failure Escalation

### If rotation fails at the source platform:
- **Symptom:** Platform rejects the old secret during old-key revocation, or won't generate a new secret
- **Action:** File Linear class-2 incident (not DTS-SEC-ROTATION; file separately)
- **Escalate to:** Platform support (Stripe, Apollo, etc.)
- **Doppler:** do NOT update Doppler if the source secret is not confirmed new
- **Make:** do NOT update connection until new secret is confirmed valid

### If Doppler update succeeds but Make scenario fails:
- **Symptom:** Doppler shows the new secret, but Make webhook auth fails with 401
- **Action:** 
  1. Revert Doppler to the old secret value (from your session notes)
  2. Test Make webhook again — should succeed
  3. Check the new secret value for copy-paste errors or platform-specific format (e.g., some platforms prepend a prefix like `whsec_`)
  4. Re-update Doppler with corrected value
- **If still failing:** file Linear class-1 incident; escalate to Anthropic Make support

### If Composio update fails:
- **Symptom:** "Failed to update connection in Composio" error
- **Action:**
  1. Revert Doppler
  2. Try updating the Composio connection again via dashboard (click "Edit → Re-enter credentials")
  3. If Composio dashboard update also fails: Composio API may be temporarily unavailable
  4. Retry after 5 minutes; if persistent, file class-1 incident to Anthropic Composio support
- **Note:** Do NOT use `DOPPLER_SECRETS_UPDATE` to work around Composio failures; use the Doppler dashboard UI or CLI only

### If test webhook never arrives in Make:
- **Symptom:** Webhook is sent (confirmed at source platform), but Make execution logs show nothing
- **Action:**
  1. Check Make scenario is "on"
  2. Check webhook URL is correct (copy from Make trigger → copy webhook URL)
  3. Check Make scenario logs for incoming requests (even if unsigned, there should be a raw request)
  4. If no requests appear: webhook may be filtered at Cloudflare or Make networking layer
  5. File class-2 incident; escalate to Make support with webhook URL + platform name

---

## Automation: SEC-004 Datadog Metrics

SEC-004 reads secret metadata every Sunday 02:00 UTC and writes Datadog metrics. The metric `doppler.secret.age_days` is the source of truth for rotation urgency.

If you manually rotate a secret **before** Sunday's run:
- The metric will remain stale until Sunday 02:00 UTC
- You can manually trigger SEC-004 to refresh metrics immediately:
  1. Make dashboard → SEC-004 scenario → click "Run now"
  2. Wait 30 seconds for completion
  3. Check Datadog `doppler.secret.age_days{secret_name="STRIPE_WEBHOOK_SECRET"}` — should reset to ~0d

If Sunday's SEC-004 run fires DTS-SEC-ROTATION but you've already rotated:
- Just comment on the milestone: "Already rotated on [date]. Closing."
- Close the milestone

---

## Verification Checklist (Per Rotation)

Before closing DTS-SEC-ROTATION milestone:

- [ ] Secret rotated at source platform (confirm new value in platform UI/API)
- [ ] Doppler updated with new secret (via dashboard or CLI, NOT Composio)
- [ ] 5-minute cache wait complete
- [ ] Signed test request succeeded (webhook arrived + HMAC verified)
- [ ] Datadog metric shows no HMAC failures (`webhook.hmac_failure` = 0)
- [ ] Applicable Make scenarios passed smoke test (run once, watch logs)
- [ ] Old key revoked at source platform (if applicable)
- [ ] Rotation logged in `Implementation/secret-rotation-log.md`
- [ ] Comment posted on DTS-SEC-ROTATION milestone with details + operator initials
- [ ] Milestone status set to Done

---

## Exceptions & Special Cases

### High-rotation-frequency secrets (Stripe, Apollo)
These hit the 25-day alert threshold and require earlier rotation. If a milestone opens and you can't rotate immediately:
- Comment: "Will rotate on [specific date]" + reason
- Keep milestone open (do not close until rotated)
- Re-prioritize as needed; Datadog will not spam duplicate milestones if the threshold remains unmet

### Temporary secrets (test API keys, sandbox keys)
If a secret is known to be test-only and intentionally stale (e.g., for a deprecated sandbox):
- Comment on DTS-SEC-ROTATION: "Test secret; no rotation required. Closing."
- Close the milestone
- Consider whether the secret should be removed from rotation monitoring entirely (ask ops owner)

### Secret rotation during an incident
If an incident (class-1 or class-2) requires immediate secret rotation (e.g., suspected compromise):
- Follow this runbook immediately; do NOT wait for DTS-SEC-ROTATION milestone
- File a separate class-1 incident (e.g., "DTS-INCIDENT-...") as the parent
- Note the incident number in the `Implementation/secret-rotation-log.md` "Notes" column
- Notify Anthropic Infra team of the incident + rotation

---

## FAQ

**Q: Do I need to rotate OAuth tokens manually?**  
A: No. OAuth tokens are auto-refreshed by Make/Composio. Manual reauth is only needed if the token expires (>6 months idle) or a security event forces it.

**Q: What if I rotate the secret in Doppler but the Make scenario still fails?**  
A: See "Failure Escalation" section. Most likely: copy-paste error in the secret value, or the source platform is sending the key in a different format (e.g., with a prefix). Double-check the source and re-paste carefully.

**Q: Can I use Composio `DOPPLER_SECRETS_UPDATE` to rotate secrets?**  
A: **No. Never.** That tool returns the entire Doppler vault contents on every call, exposing all secrets. Use Doppler dashboard or `doppler` CLI only.

**Q: What if Doppler is down?**  
A: SEC-002 (exclusion-zone-check) will fail closed and block all scenarios. This is by design. File a class-2 incident; escalate to Doppler support. In the meantime, scenarios are safe (they reject rather than use stale secrets).

**Q: How do I know which secrets are managed by Composio connections vs. Doppler?**  
A: See the table in "Rotation Procedure per Secret Class" (§2a, 2b, 2c). Webhook secrets and most API keys are in Doppler; OAuth is managed by Make itself.

**Q: What's the difference between this runbook and the Doppler-leak incident runbook?**  
A: This runbook is **operational** — how to respond to normal SEC-004 alerts. The incident runbook (`security-incidents/2026-04-25-vault-rotation-runbook.md`) is **incident-specific** — steps to take if there's evidence of a Doppler compromise. Read this file for day-to-day rotations; read the incident file only if there's an actual security event.

---

## See Also

- `/Implementation/security-scenarios-spec.md` — SEC-004 scenario contract + monitoring
- `/Implementation/exclusion-zone-failure-map.md` — Exclusion Zone enforcement (complementary safeguard)
- `/CLAUDE.md` — § Doppler-via-Composio bans (why certain Composio tools are forbidden)
- `/Implementation/security-incidents/2026-04-25-vault-rotation-runbook.md` — Incident response (if suspected Doppler breach)
