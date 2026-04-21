# Dobeu-Eco v5 — Stage 0A User Action Runbook

**Purpose:** Click-by-click instructions for the 12 user actions (U1-U12) that gate v5 plan sign-off and unblock Stage 1.
**Audience:** Founder (jswilliamstu@gmail.com), executing actions solo.
**Estimated total time:** ~115 minutes (padded from 90-min baseline for reauth retries + Cloudflare Worker deploy).
**Execution window:** Single focused block preferred. U10 + U11 require 20 uninterrupted minutes.
**Gate exit criteria:** All 12 items checked in the Completion Checklist + `COMPOSIO_MANAGE_CONNECTIONS action=list` reports all 4 Make connections healthy + Doppler audit log shows 12 secrets present.
**Escalation:** If any single item is blocked >72h, a class-3 Linear exception auto-fires per Stage 0A gate rule. See Escalation Contacts at the bottom.

**Before you start — prerequisites:**
- Logged into 1Password (or whichever password manager stores Apollo / Doppler / Intercom credentials)
- Chrome or Firefox with existing sessions for: `app.make.com`, `apollo.io`, `dashboard.doppler.com`, `app.composio.dev`, `app.intercom.com`, `linear.app`, `supabase.com/dashboard`, `dash.cloudflare.com`, `drive.google.com`, `dashboard.stripe.com`
- Terminal with `wrangler` installed (`npm i -g wrangler` if not), `git`, and `curl`
- Local working directory: `C:\Users\jswil\dobeu-eco\`
- `dobeutech/dobeu-composio-automate` repo cloned locally (canonical target for artifacts)

**Items flagged as non-deterministic (require your decision before execution):**
- **U8** — Pricing tier logic. The runbook gives you a decision framework; you must pick before Stage 4.1 saga branches can be built.
- **U11** — Cloudflare Worker deployment. Assumes repo `dobeutech/dobeu-composio-automate` has `v5-cf-worker-*` files scaffolded. If not present, the first step of U11 is an agent-delegated scaffold; re-run U11 after the scaffold exists.
- **U9** — The Drive `dobeu-master.env` file audit is deterministic, but the remediation branch (rotate vs placeholder) depends on what's actually in there right now.

---

## U1 — Rotate Apollo master API key

### What you're doing
Rotating the Apollo master-scope API key (currently `D4BqMzt0H7E-VzDWFrteoQ`, alias `apollo_evince-palolo`) and propagating the new value to Doppler, Composio, and Make connection 4526971.

### Why it blocks
- Stage 4.1 (Stripe Kickoff saga step 3 Apollo enrichment)
- Stage 4.2 (Apollo prospect-signal scenarios)
- SEC-004 `secret-rotation` weekly cron cannot be green until the current key is <25 days old

### Step-by-step
1. Open `https://app.apollo.io/#/settings/integrations/api` in a new tab. Log in if prompted.
2. Confirm the key row labeled `apollo_evince-palolo` (or whatever you named the master key per DTS-1651). Click the three-dot menu on its row. Click **Revoke** — acknowledge the confirmation dialog.
3. On the same page, click the **Create new key** button (top right).
4. In the modal:
   - **Key name:** `apollo_evince-palolo-v2` (incrementing the alias helps audit trail)
   - **Scopes:** select **All (master scope)** — match the prior key's scope exactly. Verify 4/4 capabilities are checked.
   - **Expiration:** 90 days (Apollo max). Note the date.
5. Click **Create**. Apollo will show the raw key ONCE. Copy it to clipboard immediately.
6. Paste it into a scratch file at `C:\Users\jswil\dobeu-eco\.scratch\apollo-new-key.txt` (create `.scratch` dir first; it is gitignored per Drive mirror policy). You will shred this file at the end of U1.
7. Open Doppler at `https://dashboard.doppler.com/workplace/projects`. Select project **dobeu-ecosystem** → config **prd** (or whichever config is the production branch — if unclear, check which config Make connection 4526971 reads).
8. Find secret `APOLLO_MASTER_API_KEY`. Click the pencil icon. Paste the new key value. Click **Save**. Confirm the masked preview shows the new last-4 characters.
9. Open Composio at `https://app.composio.dev/connected_accounts`. Filter by toolkit `apollo`. Click the existing Apollo connection row.
10. Click **Update Credentials** or **Reauthorize**. In the API key field, paste the new key. Click **Save**.
11. Open Make at `https://us1.make.com/315584/connections`. Search for connection **4526971** (Apollo). Click the pencil icon. In the field `API Key`, paste the new key. Click **Save** → **Reverify**.
12. Shred the scratch file: `del C:\Users\jswil\dobeu-eco\.scratch\apollo-new-key.txt`.

### Verification
- Apollo settings page shows only the new key row, old key absent.
- Doppler `APOLLO_MASTER_API_KEY` last-updated timestamp is within the last 5 minutes.
- Composio connection row shows green "Active" badge.
- Make connection 4526971 shows **Verified** with a green dot.
- Run in terminal:
  ```bash
  curl -s "https://api.apollo.io/v1/auth/health" -H "X-API-KEY: <new-key>" | head
  ```
  Expect HTTP 200 with `{"is_logged_in":true,...}`.
- File a Linear comment on DTS-1651: `apollo master key rotated v2, expires <YYYY-MM-DD>, propagated to Doppler + Composio + Make 4526971`.

### If it fails
- **Apollo won't let you create a key with master scope:** Your Apollo plan dropped below the tier that permits master-scope keys. Contact Apollo support; in the meantime, create a scoped key covering `contacts.read`, `contacts.write`, `people.search`, `people.match` and document the downgrade in DTS-1651.
- **Make connection 4526971 shows "Invalid credentials" after paste:** Apollo sometimes takes 60 seconds to propagate a new key. Wait, click Reverify again. If still failing, revoke and recreate the key.
- **Composio shows "Connection failed" on save:** The toolkit auth schema may require `X-Api-Key` header format. In Composio, delete the connection and use `MANAGE_CONNECTIONS` → initiate_connection for `apollo` from scratch.

### Time budget
**5 minutes** (add 5 if Apollo UI has changed post-2026-04; their Settings IA shifted twice in 2025).

---

## U2 — Populate 12 Doppler secrets

### What you're doing
Creating or updating 12 secrets in the Doppler `dobeu-ecosystem` project. Some may already exist with placeholder values; you're setting real values.

### Why it blocks
- ALL of Stage 4 (every scenario reads at least one of these)
- SEC-004 rotation monitoring has nothing to monitor until these exist
- Stage 0B DLQ scenario needs `SENTRY_DSN` for error telemetry

### Step-by-step

1. Open `https://dashboard.doppler.com/workplace/projects/dobeu-ecosystem/configs/prd`.
2. If `dobeu-ecosystem` project does not exist: click **Create Project** → name `dobeu-ecosystem` → environments `dev`, `stg`, `prd`. Then re-open the `prd` config.
3. For each of the 12 secrets below, click **Add Secret** (bottom of page or `+` button near the secrets list). Paste the **exact** name, then paste the value. Click **Save**.

| # | Secret Name | Value source | Notes |
|---|-------------|--------------|-------|
| 1 | `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → (endpoint) → Signing secret (click **Reveal**) | If no endpoint exists yet, create one pointing at the Make gateway webhook URL first (blocked on Stage 0B.11; use placeholder `whsec_PLACEHOLDER` until then) |
| 2 | `TYPEFORM_WEBHOOK_SECRET` | Typeform → form → Connect → Webhooks → (existing) → Secret | Each Typeform webhook has its own secret; use a single shared value by editing all webhooks to use one string. Generate via `openssl rand -hex 32` |
| 3 | `INTERCOM_WEBHOOK_SECRET` | Set in U6 | Placeholder until U6 executes |
| 4 | `APOLLO_WEBHOOK_SECRET` | Apollo → Settings → Integrations → Webhooks → Secret | Distinct from U1 master API key |
| 5 | `POSTHOG_WEBHOOK_SECRET` | PostHog → Project Settings → Webhooks → (endpoint) → Secret | |
| 6 | `LINEAR_WEBHOOK_SIGNING_SECRET` | Set in U7 | Placeholder until U7 executes |
| 7 | `WEBFLOW_WEBHOOK_SECRET` | Webflow → Site → Settings → Integrations → Webhooks → Add → copy secret | Needed for `dobeu.online` form ingress |
| 8 | `RUBE_MONITOR_SECRET` | Generate via `openssl rand -hex 32` | Decommission 2026-05-15 per DTS-1649 |
| 9 | `CF_WORKER_READ_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → Custom → Permissions: `Workers Scripts:Read` + `Workers R2 Storage:Read` → Zone `dobeu.online` | Used by Ops dashboard to read Worker metrics |
| 10 | `SENTRY_DSN` | Sentry → (project) → Settings → Client Keys (DSN) → copy DSN URL | If no Sentry project yet: create project `dobeu-automation`, platform `javascript`. DSN appears on project creation |
| 11 | `APOLLO_MASTER_API_KEY` | Already set in U1 | Verify U1 completed; if value is the old key, re-paste new one |
| 12 | `EXCLUSION_ZONE_JSON` | Paste value below | Exact JSON string; single line |

For secret 12 `EXCLUSION_ZONE_JSON`, paste this exact value (one line, no trailing whitespace):

```
{"github_repos":["dobeutech/agent-usl-website","dobeutech/usl-agent-website"],"netlify_project_uuids":["e8cf44e2-089c-4f4c-8b10-1998df378cf7"],"dts_enforcement_issue":"DTS-1653","version":"v5.0"}
```

4. After all 12 are added, in the Doppler UI click **Audit Log** (left sidebar). Confirm 12 `secret.create` or `secret.update` entries in the last 30 minutes.
5. Also add: `SUPABASE_EVENT_LEDGER_KEY` (set during U10, placeholder `TBD-U10` now). This is the 13th secret but not in the Appendix I list — it's from Appendix J and needs a placeholder row now so Make scenarios can reference it without breaking the parser.

### Verification
- Doppler UI shows 12 (13 counting U10 placeholder) rows under `prd` config.
- Run `doppler secrets --project dobeu-ecosystem --config prd --only-names` from your terminal (after `doppler login`). Output lists all 12 names.
- Doppler audit log entries match.

### If it fails
- **"Secret name already exists":** Fine — you're updating, not creating. Use pencil icon instead.
- **Doppler CLI not installed:** `iwr -useb https://cli.doppler.com/install.ps1 | iex` on PowerShell, then `doppler login`.
- **Stripe webhook endpoint doesn't exist yet:** Acceptable — use placeholder `whsec_STRIPE_PENDING_0B11`. Document in DTS Linear comment that Stage 0B.11 needs to backfill this. Same pattern for any secret blocked on infra-not-yet-built.

### Time budget
**20 minutes** (heavy on copy-paste + switching between 7 dashboards).

---

## U3 — Reauthorize Make connection 4526466 (Google / Gmail)

### What you're doing
Reauthorizing the broken Google Gmail connection `jswilliamstu@gmail.com-f` (connection ID 4526466) whose refresh token became invalid on 2026-04-20 23:06 UTC.

### Why it blocks
- Scenario 4461705 Client Email CRM Logger (currently deactivated per checkpoint)
- Stage 0C.4 Wave A observability
- Any future Gmail-read scenario using this connection

### Step-by-step
1. Open `https://us1.make.com/315584/connections` (Make → team 315584 Dobeu Tech Solutions → Connections).
2. In the search box top-right, type `4526466` or `jswilliamstu@gmail.com-f`. The connection row appears with a red "Invalid" or yellow "Reauthorize" badge.
3. Click the connection row to open its detail panel.
4. Click the **Reauthorize** button (or **Reconnect** — label varies by Make version).
5. A new browser tab opens to the Google OAuth consent screen `accounts.google.com`. Select account **jswilliamstu@gmail.com** (the exact one — do not choose a different Google account).
6. Google will show the scopes requested (for Gmail this includes `https://mail.google.com/`, `gmail.send`, `gmail.modify`, `gmail.readonly` — the exact set depends on scenario usage).
7. Click **Continue** on the "Google hasn't verified this app" screen if it appears (Make.com is a verified publisher, but some tenants show it anyway). Click **Advanced** → **Go to Make (unsafe)** if needed — it's safe, just Google's warning for all OAuth apps.
8. Click **Allow** on the final scope grant screen.
9. Browser redirects back to Make. The connection detail panel now shows **Verified** with green dot and `Last verified: <timestamp>`.
10. Click **Reverify connection** button in Make once more to force a health check.

### Verification
- Make connection 4526466 shows green **Verified** badge.
- Scenario 4461705 execution history (wait 15 min for next schedule tick) shows a successful execution.
- `COMPOSIO_MANAGE_CONNECTIONS action=list toolkit=gmail` includes this account in "active" state (if exposed — Make-native connections aren't always Composio-visible, so this is best-effort).
- Add Linear comment on DTS-1642 or whichever issue tracks scenario 4461705: `4526466 reauthed, scenario 4461705 reactivated, first successful exec <timestamp>`.

### If it fails
- **"Access blocked: Make has not completed the Google verification process":** Your Google Workspace admin (if this is a Workspace account) has restricted unverified apps. Go to Workspace Admin → Security → API Controls → Manage Third-Party App Access → search "Make" → Trust. Retry OAuth.
- **Consent screen redirects back without error but connection still shows Invalid:** Clear browser cookies for `accounts.google.com` and `us1.make.com`. Retry in incognito.
- **Refresh token keeps dying every few hours:** Indicates the OAuth client has `Testing` mode set in Google Cloud Console (testing-mode refresh tokens expire after 7 days). This is a U4-adjacent issue — move the Google OAuth client to `In production` status. Not your client to manage? Contact Make support.

### Time budget
**5 minutes** (10 if Workspace admin unblock is needed).

---