# Security Scenarios Specification (SEC-001 through SEC-005)

**Status:** Authoritative version. v5 plan Appendix L is now a mirror.

**Date:** 2026-04-20  
**Updated:** 2026-04-25  
**Owner:** Security team (Datadog + Linear exception tracking)

---

## Overview

Five Make scenarios enforce security posture across all of Stage 1 through Stage 5 execution. All scenarios follow the v5 subscenario contract (Appendix H) for error handling and linear milestone writes.

**Cross-reference caveat:** 
- SEC-001 `pii-scrub` user-facing procedure lives in `/Implementation/secret-rotation-runbook.md` (Sections 3a-3b only; see that file for full context)
- PII_SCRUB is invoked by Stages 1.6, 3.1, 4.1, 4.2, 4.3, 4.4 **before any Linear write**
- All 5 scenarios reference subscenario `4688116` (exception DLQ) and `4688121` (milestone writes)
- Subscenario contract details: Appendix H (v5 plan)

---

## SEC-001: PII Scrub

| Attribute | Value |
|---|---|
| **Make scenario ID** | (created Stage 0B.4, deployed Stage 1.6) |
| **Invocation** | Subscenario call; on-demand before any Linear issue write |
| **Trigger** | Any stage (1.6, 3.1, 4.1, 4.2, 4.3, 4.4) writes a Linear issue with human-visible content |
| **Owner** | Claude Haiku (via Composio `COMPOSIO_EXECUTE_CUSTOM_CODE` LLM) |
| **Timeout** | 15s (regex pass) + 20s (LLM pass) = 35s maximum |
| **Retry** | 3x exponential backoff (1s, 3s, 9s) per subscenario contract |

### Input
```json
{
  "schema_version": "1.0.0",
  "text": "raw text from Linear issue body or description",
  "scrub_mode": "strict|lenient",
  "correlation_id": "uuid"
}
```

### Scrubbing Logic

**Phase 1: Regex pass** (fail-open)
Detect and redact:
- Email addresses: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}`
- E.164 phone numbers: `\+?[1-9]\d{1,14}` with optional whitespace/hyphens
- US Social Security numbers (SSN): `\d{3}-\d{2}-\d{4}` or `\d{9}`
- Credit-card PANs: `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}` (only valid Luhn passes)
- IPv4: `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`
- IPv6: `[a-fA-F0-9:]+` (CIDR-safe, non-greedy)
- USPS addresses: street + city/state/ZIP patterns
- Stripe object IDs: `(cus_|pi_|ch_|inv_|sub_)[a-zA-Z0-9]{20,}` (PII-adjacent; customer IDs may leak PII)
- Session IDs / tokens: `(sid_|token_|session_)[a-zA-Z0-9._-]{20,}`
- Revenue figures: `\$[0-9,]+\.[0-9]{2}` or `€|£|¥` + numeric (money is contextually sensitive)

**Replacement:** each match replaced with `[REDACTED:TYPE]` (e.g., `[REDACTED:EMAIL]`, `[REDACTED:SSN]`)

**Phase 2: LLM pass** (fail-closed on timeout; defaults to regex-only)
Claude Haiku (`model: claude-3-5-haiku-20241022`, `temperature: 0`) with structured output:
- **Task:** detect names (first + last, any language script), addresses not caught by regex, revenue/pricing context
- **Input schema:** `{ "text": "string", "scrub_mode": "strict|lenient" }`
- **Output schema:**
  ```json
  {
    "found_names": ["Name 1", "Name 2"],
    "found_addresses": ["Address 1"],
    "found_revenue_context": ["context snippet 1"],
    "scrub_recommendation": "strict|lenient|none"
  }
  ```
- **Strict mode:** redact all names, all address-like text, all revenue context (order of magnitude + currency)
- **Lenient mode:** redact full names only; allow generic first names; allow company names; allow general revenue language ("high-value", "growth")

### Output — Success (Phase 1)
```json
{
  "ok": true,
  "scrubbed_text": "redacted_text_with_[REDACTED:EMAIL]_markers",
  "redaction_count": 5,
  "redaction_types": ["email", "phone", "ssn"],
  "correlation_id": "uuid"
}
```

### Output — Success (Phase 1 + 2)
```json
{
  "ok": true,
  "scrubbed_text": "further_redacted_including_names",
  "redaction_count": 8,
  "redaction_types": ["email", "phone", "ssn", "full_name"],
  "llm_pass_completed": true,
  "scrub_mode_applied": "strict",
  "correlation_id": "uuid"
}
```

### Output — Error
```json
{
  "ok": false,
  "error_class": "validation|timeout|llm_unavailable",
  "error_code": "string",
  "fallback_action": "reject_write|use_regex_only",
  "retryable": true,
  "correlation_id": "uuid"
}
```

### Invocation Pattern (Stages 1.6, 3.1, 4.1, 4.2, 4.3, 4.4)

```
[webhook input] 
  → (Parse payload) 
    → [Call SEC-001: pii-scrub] 
      → (receive scrubbed_text) 
        → [Call SEC-002: exclusion-zone-check] 
          → (blocked=false) 
            → [Call 4688121: linear-write-milestone with scrubbed_text]
```

---

## SEC-002: Exclusion Zone Check

| Attribute | Value |
|---|---|
| **Make scenario ID** | (created Stage 0B.5, deployed Stage 0B minimum) |
| **Invocation** | Subscenario; mandatory preflight before any GitHub/Netlify/Linear scenario |
| **Trigger** | ANY scenario attempting to read/write GitHub repo, Netlify project, or Linear issue/project |
| **Reads** | Doppler secret `EXCLUSION_ZONE_JSON` (5-min cache) |
| **Failure mode** | Fail-closed: block parent scenario, emit class-3 exception to 4688116 DLQ |
| **Timeout** | 10s |
| **Retry** | 3x exponential backoff (1s, 3s, 9s) per contract |

### Input
```json
{
  "schema_version": "1.0.0",
  "check_source": "github|netlify|linear",
  "identifiers": ["array", "of", "repo_names_or_uuids"],
  "correlation_id": "uuid"
}
```

### Blocking Logic
- Reads `EXCLUSION_ZONE_JSON` from Doppler (cached; cache miss triggers fresh fetch)
- For GitHub: exact-match both canonical and alias forms (e.g., `dobeutech/agent-usl-website` AND `dobeutech/usl-agent-website`)
- For Netlify: UUID string match
- Returns `{blocked:bool, matched:string?}` where `matched` is the first identifier that triggered a block

### Output — Allowed
```json
{
  "ok": true,
  "blocked": false,
  "matched": null,
  "correlation_id": "uuid"
}
```

### Output — Blocked
```json
{
  "ok": true,
  "blocked": true,
  "matched": "dobeutech/agent-usl-website",
  "correlation_id": "uuid"
}
```
Parent scenario immediately halts; emits class-3 exception via 4688116 with `error_class: "exclusion_zone_violation"` and Datadog `exclusion_zone.violation_attempted` metric.

### Output — Error (Doppler unavailable)
```json
{
  "ok": false,
  "error_class": "doppler_unavailable|validation|timeout",
  "error_code": "string",
  "retryable": true,
  "correlation_id": "uuid"
}
```
Parent scenario class-3 exception filed; escalated to DTS-1653.

**Full details:** See `/Implementation/exclusion-zone-failure-map.md`

---

## SEC-003: DSAR Handler

| Attribute | Value |
|---|---|
| **Make scenario ID** | (created Stage 3 — data-subject-access-request)  |
| **Invocation** | On-demand, triggered by human filing "DSAR request" Linear issue in `[Ops] Automation Failures` project |
| **Trigger** | Linear issue with label `dsar-request`; body contains `subject_email` field |
| **SLA** | 30 calendar days from issue creation |
| **Owner** | Data Protection Officer review + Composio automation |

### Workflow

1. **Parse Linear issue:** extract `subject_email` from issue body
2. **Hash email:** `subject_email_hash = sha256(subject_email.lower())`
3. **Query event_ledger:** 
   ```sql
   SELECT * FROM event_ledger 
   WHERE source_object_id = subject_email_hash
   ORDER BY first_seen_at DESC
   ```
4. **Fetch R2 payloads:** for each ledger row with `payload_pointer_r2`, fetch signed-URL (15-min TTL) and bundle into a single-file archive (tarball or zip)
5. **Generate signed R2 bundle:** upload combined archive to `r2://dobeu-webhook-archive/dsar/<request_id>/subject-data.tar.gz` with signed URL (30-day TTL)
6. **Write milestone:** call 4688121 with class-4, body containing R2 signed URL + expiry timestamp
7. **Set label:** add `dsar-delivered` to Linear issue
8. **Deletion flow (on "right to erasure" request):** same as steps 1-4, then delete all R2 payloads and INSERT ledger row with `status='deleted_per_dsar'` and `deletion_timestamp`

### Output
- Linear issue updated with milestone containing signed R2 URL
- issue label: `dsar-delivered`
- Datadog metric: `dsar.bundle_delivered` increments
- R2 archive available for 30 days; manual download by subject or DPO

---

## SEC-004: Secret Rotation

| Attribute | Value |
|---|---|
| **Make scenario ID** | (created Stage 0B, runs Stage 4+)  |
| **Invocation** | Weekly cron trigger |
| **Schedule** | Sunday 02:00 UTC |
| **Owner** | Automated alerts + manual operator rotation |

### Metrics Collection

**Reads all Doppler secrets** (via `DOPPLER_SECRETS_NAMES` — **NOT** `DOPPLER_SECRETS_GET` or `_LIST` per CLAUDE.md safeguards):
1. List all secret names from Doppler `dobeu-core` / `prd` config
2. For each secret, compute age in days since last rotation (stored in metadata or hardcoded rotation date)
3. Write Datadog metric `doppler.secret.age_days{secret_name="STRIPE_WEBHOOK_SECRET"}` = N

### Alert Thresholds

| Secret class | Alert at 80d | Alert at 25d | Rotation urgency |
|---|---|---|---|
| **Standard** (webhook signing, API keys except noted) | yes | no | normal; grace period exists |
| **Stripe webhook + Apollo master** | yes | **yes (early)** | high; payment/lead-gen impact |
| **OAuth refresh tokens** | no (auto-reissued on reauth) | no | manual reauth only |

### Linear Milestone Trigger

When **any secret exceeds 80 days** (or **25 days for Stripe/Apollo**):
- Open Linear milestone `DTS-SEC-ROTATION` (or reopen if closed)
- Body: list all secrets requiring rotation + age in days
- Add label: `class/rotation-required`
- Assign to ops owner
- Call subscenario 4688121 with `class:4, title:"Secret Rotation Required"` + milestone body

### Operator Actions

See `/Implementation/secret-rotation-runbook.md` (Sections 2a-2e) for per-class rotation procedure. Operator MUST NOT use `DOPPLER_SECRETS_UPDATE` via Composio; use Doppler dashboard or CLI instead.

### Completion

Once operator completes rotation (Doppler updated, test webhook signed, etc.):
1. Comment on DTS-SEC-ROTATION milestone: "Rotated: STRIPE_WEBHOOK_SECRET (new age: 0d)"
2. Close milestone
3. Datadog metric resets on next Sunday 02:00 UTC run

---

## SEC-005: Secret Scan

| Attribute | Value |
|---|---|
| **Make scenario ID** | (created Stage 0B, runs Stage 4+)  |
| **Invocation** | Weekly cron trigger |
| **Schedule** | Saturday 14:00 UTC (day before SEC-004) |
| **Owner** | Automated scan + manual remediation |

### Scan Targets

1. **Drive mirror** `/dobeu-eco/` (local `C:\Users\jswil\dobeu-eco\`)
2. **Canonical repo** `dobeutech/dobeu-composio-automate` (via `git clone --mirror` or GitHub API file listing)

### Tools & Patterns

**Trufflehog v3:** detects entropy-based secrets (API keys, tokens, connection strings)  
**Gitleaks:** regex-based secret patterns (Stripe `sk_live_`, GitHub PAT `ghp_`, Firebase `nfp_`, AWS `AKIA`, etc.)

**Additional patterns:**
- Both GitHub repo aliases: `dobeutech/agent-usl-website` and `dobeutech/usl-agent-website`
- Netlify UUID: `e8cf44e2-089c-4f4c-8b10-1998df378cf7`
- File content leaks: raw content from `.env*` files, `*.pem`, `*.key`, `secrets.*`

### Output: On Hit

1. **File Linear class-3 exception** via 4688116 with:
   - `error_class: "secret_detected"`
   - `r2_pointer`: link to R2 archive of scan output (detailed matches)
   - Evidence: filename + line number + matched pattern (with secret value **redacted**)
2. **Trigger SEC-004 manually** (do not wait for Sunday) to rotate the affected secret
3. **Datadog metric:** `secret_scan.violations_found` increments
4. **Slack alert:** async notification to Dobeu #security channel (if configured)

### Output: Clean

- Linear milestone `DTS-SEC-SCAN` marked complete (if open)
- Datadog metric `secret_scan.clean_runs` increments
- No exceptions filed

---

## Scenario Cross-Reference Table

| Scenario | Depends on | Called by | Failure escalation |
|---|---|---|---|
| SEC-001 (pii-scrub) | (none; independent) | Stages 1.6, 3.1, 4.1, 4.2, 4.3, 4.4 before Linear writes | 4688116 DLQ class-3 → Datadog `pii_scrub.failure` metric |
| SEC-002 (exclusion-zone-check) | Doppler `EXCLUSION_ZONE_JSON` | Any scenario touching GitHub/Netlify/Linear; mandatory preflight | 4688116 DLQ class-3 → Datadog `exclusion_zone.violation_attempted` → DTS-1653 escalation |
| SEC-003 (dsar-handler) | Supabase `event_ledger`, R2 `dobeu-webhook-archive` | Manual Linear issue label trigger `dsar-request` | 4688116 DLQ class-3; manual DPO review if deletion fails |
| SEC-004 (secret-rotation) | Doppler secret metadata (age) | Weekly cron Sunday 02:00 UTC | 4688121 milestone `DTS-SEC-ROTATION` opens; Datadog `doppler.secret.age_days` alert |
| SEC-005 (secret-scan) | Drive mirror, canonical repo, trufflehog, gitleaks | Weekly cron Saturday 14:00 UTC | 4688116 DLQ class-3 on hit; no exceptions on clean |

---

## Subscenario Contracts

All five scenarios call the following subscenarios per Appendix H (v5 plan):

### 4688116 — `subscenario:linear-create-exception`
Called on any error. Input:
```json
{
  "schema_version": "1.0.0",
  "class": 3,
  "source_system": "sec-001|sec-002|sec-003|sec-004|sec-005",
  "event_key": "unique_key",
  "error_class": "pii_detection|exclusion_zone_violation|scan_hit|rotation_missed",
  "error_code": "string",
  "r2_pointer": "r2://bucket/path/to/details",
  "correlation_id": "uuid"
}
```

### 4688121 — `subscenario:linear-write-milestone`
Called for status/completion writes. Input:
```json
{
  "schema_version": "1.0.0",
  "class": 4,
  "title": "SEC-004 Secret Rotation Required",
  "body_summary": "Secrets over 80 days: STRIPE_WEBHOOK_SECRET (92d), APOLLO_MASTER_API_KEY (85d)",
  "r2_pointer": "r2://bucket/path/to/audit_log",
  "labels": ["class/rotation-required", "security"],
  "project_id": "ops_project_id",
  "idempotency_key": "sec-rotation-2026-04-28",
  "correlation_id": "uuid"
}
```

---

## Health Pulse Integration

SEC-001 through SEC-005 are monitored by the Automation Health Pulse (0C.2). Each scenario's last-run timestamp, success rate, and error count feed into a daily class-5 milestone write to parent issue `DTS-SYS-HEALTH`.

---

## Implementation Priority

**Stage 0B (before Stage 1):**
- SEC-001 (pii-scrub) + SEC-002 (exclusion-zone-check) only — mandatory for data boundary protection

**Stage 0B.10 onward:**
- SEC-003 (dsar-handler) — GDPR compliance, but rarely triggered

**Stage 4 (post-Stage 1 baseline):**
- SEC-004 (secret-rotation) + SEC-005 (secret-scan) — scheduled cadence

---

## Testing Checklist

Before marking each scenario complete:

- [ ] SEC-001: regex pass redacts all PII patterns; LLM pass works in sandbox; error recovery to regex-only verified
- [ ] SEC-002: Doppler read succeeds; blocked identifier returns `blocked:true`; Doppler-unavailable case returns error with retry=true
- [ ] SEC-003: R2 bundle generation works; signed URL expires in 30 days; deletion workflow tested
- [ ] SEC-004: Datadog metric writes successfully; Linear milestone DTS-SEC-ROTATION opens; alerts fire at correct thresholds
- [ ] SEC-005: Trufflehog + gitleaks run against test repo; both repo aliases matched; clean run closes any open milestone
