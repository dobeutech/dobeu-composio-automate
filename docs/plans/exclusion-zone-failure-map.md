# Exclusion Zone Failure-Domain Map

**Status:** Authoritative version. v5 plan Appendix M is now a mirror.

**Date:** 2026-04-20  
**Updated:** 2026-04-25  
**Reference:** DTS-1653 (permanent, never closes)

---

## Forbidden Identifiers

The following identifiers MUST NEVER be directly referenced, cloned, accessed, or modified by any automation scenario, agent task, or manual operation:

**GitHub:**
- Repository: `dobeutech/agent-usl-website`
- Alias (registry variant): `dobeutech/usl-agent-website` — **note the reversed word order** in some external references; grep/scan filters must match both forms

**Netlify:**
- Project UUID: `e8cf44e2-089c-4f4c-8b10-1998df378cf7`

---

## Layered Enforcement

Six independent enforcement layers provide defense-in-depth. All must be operational; failure at any one layer is escalated to DTS-1653.

| Layer | Mechanism | Trigger | Failure mode | Recovery |
|---|---|---|---|---|
| 1 · Doppler JSON | `EXCLUSION_ZONE_JSON` secret stores forbidden identifiers as JSON array; cached 5-min TTL | Rotation or emergency update via Doppler dashboard | If Doppler unavailable → SEC-002 preflight fails closed → all GitHub/Netlify/Linear scenarios reject inbound requests with class-3 exception + R2 archive | Manual Doppler restoration; retest SEC-002 health pulse |
| 2 · Subscenario preflight | `SEC-002-exclusion-zone-check` mandatory before any GitHub/Netlify/Linear scenario execution | Runs at scenario start; reads `EXCLUSION_ZONE_JSON` from Doppler; returns `{blocked:bool, matched:string?}` | If subscenario errors → parent scenario halts, emits class-3 exception via 4688116 DLQ, pages DTS-1653 | Fix subscenario code; retest in sandbox; parent scenario retries on operator resume |
| 3 · Pre-commit hook | `.githooks/pre-commit` in canonical repo `dobeutech/dobeu-composio-automate` | Runs on every git commit attempt in local clone | Blocks commits with exit code 1; developer must either abandon commit or invoke `git commit --no-verify` and file Linear issue explaining rationale | Developer documents exception in Linear; hook remains active for all future commits |
| 4 · Runtime client-side scrub | Framer head snippet section 8 (already deployed on `dobeu.dev` + `dobeu.online`); sanitizes `href` attributes at render time; logs breadcrumb to Sentry | Page load + link click | Scrubs link target; logs Sentry `breadcrumb type=ui.click` with `exclusion_zone_blocked=true` | Sentry monitor alerts; no user-visible action required; link simply becomes inert |
| 5 · Datadog metric + monitor | `exclusion_zone.violation_attempted` increments on any Layer 2 or Layer 3 hit; Datadog monitor pages DTS-1653 on >0 events/5min | Layer 2 subscenario detects block; Layer 3 pre-commit hook rejects commit | PagerDuty escalation to DTS-1653; on-call reviews R2 archive of attempted request | Incident commander documents in DTS-1653; potential remediation in checkpoint |
| 6 · Weekly audit | SEC-005 `secret-scan` scenario runs Saturday 14:00 UTC; `trufflehog` + `gitleaks` grep against Drive `/dobeu-eco/` mirror + canonical repo; searches for both repo aliases | Any new reference to forbidden identifiers introduced via code, comments, docs, config | Files Linear class-3 exception with evidence (filename, line number, context); triggers SEC-004 secret-rotation alert | Violation logged in DTS-1653; manual remediation required; re-run SEC-005 after fix to confirm |

---

## Subscenario Contract — SEC-002

**Name:** `subscenario:exclusion-zone-check`  
**Invocation:** Mandatory preflight in any scenario touching GitHub, Netlify, or Linear  
**Timeout:** 10s  
**Retry:** 3x exponential backoff (1s, 3s, 9s)

### Input
```json
{
  "schema_version": "1.0.0",
  "check_source": "github|netlify|linear",
  "identifiers": ["array", "of", "strings"],
  "correlation_id": "uuid"
}
```

### Output — Success
```json
{
  "ok": true,
  "blocked": false,
  "matched": null,
  "correlation_id": "uuid"
}
```

### Output — Block
```json
{
  "ok": true,
  "blocked": true,
  "matched": "dobeutech/agent-usl-website",
  "correlation_id": "uuid"
}
```

### Output — Error
```json
{
  "ok": false,
  "error_class": "doppler_unavailable|validation|timeout",
  "error_code": "string",
  "retryable": true,
  "correlation_id": "uuid"
}
```

---

## If All Layers Fail

**Escalation:** DTS-1653  
**Policy:** PERMANENT + NEVER CLOSES  
**Reminder cadence:** Automated cron every 90 days emails DTS-1653 assignees + Anthropic security team

DTS-1653 serves as the standing incident for any exclusion-zone breach attempt. It is not closed on individual violations; instead:
1. Each violation is logged as a comment in DTS-1653 with R2 deep link + remediation notes
2. The incident remains open to track cumulative enforcement health
3. Every 90 days, a reminder task re-validates all 6 layers + documents findings in DTS-1653
4. If a breach successfully modifies forbidden identifiers (not merely attempted), the incident escalates to Anthropic Incident Management for legal/compliance review

---

## Maintenance: Adding a New Forbidden Identifier

**Procedure:**

1. **Update Doppler secret `EXCLUSION_ZONE_JSON`** (via Doppler dashboard or CLI):
   ```bash
   doppler secrets set EXCLUSION_ZONE_JSON='{"github_repos":["dobeutech/agent-usl-website","dobeutech/usl-agent-website"],"netlify_uuids":["e8cf44e2-089c-4f4c-8b10-1998df378cf7","NEW_UUID"]}'  \
     --project dobeu-core --config prd
   ```
   Do NOT use `DOPPLER_SECRETS_UPDATE` via Composio (per CLAUDE.md § Doppler-via-Composio bans).

2. **Wait 5 minutes** for Doppler cache TTL to expire across all systems.

3. **Test SEC-002 health pulse:**
   - Invoke SEC-002 subscenario in sandbox with new identifier in the input
   - Confirm `blocked=true, matched="NEW_IDENTIFIER"` in output
   - If failure, revert Doppler update and file class-3 exception

4. **Update this file (`exclusion-zone-failure-map.md`)**  
   - Add identifier to Forbidden Identifiers section (both alias forms for GitHub)
   - Update the Doppler JSON example in Maintenance section
   - Add changelog entry at end of file

5. **Commit to canonical repo:**
   ```bash
   git add Implementation/exclusion-zone-failure-map.md
   git commit -m "[SEC] Add exclusion-zone identifier: NEW_UUID — DTS-XXXX rationale"
   ```
   The pre-commit hook (Layer 3) will NOT block this commit because the identifier is already in Doppler; the hook only blocks *new* commits that reference the forbidden identifier *without* Doppler awareness.

6. **File Linear milestone DTS-SEC-IDENTIFIER-UPDATE:**
   - Reference the commit SHA
   - Link to Doppler update timestamp
   - Mark complete once all 6 layers confirm green in next weekly audit

---

## Changelog

| Date | Identifier | Reason | DTS reference |
|---|---|---|---|
| 2026-04-20 | `dobeutech/agent-usl-website` (+ alias `dobeutech/usl-agent-website`) | Customer-work exclusion zone; Legal hold | DTS-1653 |
| 2026-04-20 | Netlify `e8cf44e2-089c-4f4c-8b10-1998df378cf7` | Customer-work exclusion zone; Netlify project UUID | DTS-1653 |

---

## Audit Checklist (Weekly)

Run before closing any week:

- [ ] SEC-005 `secret-scan` completed Saturday 14:00 UTC; no class-3 exceptions filed
- [ ] Datadog `exclusion_zone.violation_attempted` metric shows 0 events this week
- [ ] DTS-1653 has no new comments (would indicate a block event)
- [ ] All 6 layers operational per status dashboard (or spike filed against broken layer)
- [ ] Doppler `EXCLUSION_ZONE_JSON` cached timestamp within 5-minute window
- [ ] At-risk: Any developer comment in a PR referencing repo name (check GitHub search for keyword + alias)
