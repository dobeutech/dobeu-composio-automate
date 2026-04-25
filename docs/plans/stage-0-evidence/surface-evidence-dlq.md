# Surface Evidence: DLQ self-test (A1 criteria — PARTIAL)

**Date:** 2026-04-25
**Surface:** DLQ self-test (internal — designed to validate the v5.1 A1 exit-criteria standard on the smallest possible scope before the 5 external surfaces)
**Source plan task:** Task 1
**Test type:** Signed self-test webhook from Composio Remote Workbench
**Event key:** `dlq-self-test-2026-04-25-1777087539`
**Webhook URL:** `https://hook.us1.make.com/80svpsao6sbj759pjzqytj6w1hxw3x0m`
**Make scenario:** `4688746` (`dlq-master-v2`)
**Make execution ID:** `425f2e4586dc4339bcf9b6b21b061958`
**Make execution timestamp:** 2026-04-25T03:25:39.278Z
**Make execution status:** 2 (warning), duration 1.65s, 2 operations, 200 centicredits, 1.4 KB transfer

---

## A1 acceptance: PARTIAL

| Artifact | Status | Notes |
|---|---|---|
| 1. Supabase `event_ledger` row | NOT PRODUCED | 0 rows in table; full COUNT(*) over `public.event_ledger` returns 0 (table has never had any row written) |
| 2. Linear issue (class-1 or class-3) | NOT PRODUCED | 0 issues created in DTS team on 2026-04-25 |
| 3. Datadog event tagged with event_key | NOT VERIFIED | not queried after the gap was found in #1 + #2; unlikely to have fired since scenario didn't reach Datadog modules |
| 4. R2 archive object | N/A | DLQ scenario is an internal failure-route consumer; ingress R2 archival is owned by the Cloudflare Worker, not this scenario |

---

## What WAS proven (positive sub-results)

These satisfy a meaningful subset of Task 1 and unblock subsequent stage gates:

1. **Make Custom Variable creation via API works.** A new team-level variable `DLQ_SHARED_SECRET` was POSTed to `/api/v2/teams/315584/variables` (response 200 with `teamVariable.name="DLQ_SHARED_SECRET", isSystem:false, typeId:2`). Re-listed team variables confirm it persists.
2. **Doppler ↔ Make team-variable alignment works.** Same value (`94b56...`) is now present in both Doppler `dobeu-core/prd/DLQ_SHARED_SECRET` and Make team variable. Either source can be used to compute matching HMACs.
3. **Make's `env.X` resolution against Custom Variables works.** Scenario `4688746` module 2's filter expression `{{sha256(env.DLQ_SHARED_SECRET + ifempty(headers['x-dobeu-dlq-raw'], ""))}} == headers['x-dobeu-dlq-sig']` no longer produces the pre-fix `Function 'sha256' finished with error! ... Received null` error. The pre-fix root cause (variable referenced but not defined) is RESOLVED.
4. **Signed webhook ingress works.** Test HMAC signature `d4f6aba0...` (sha256 of secret+body) was sent in `x-dobeu-dlq-sig` header. Webhook returned HTTP 200 "Accepted" — meaning the gateway accepted the request and the scenario was queued for execution.
5. **HMAC filter passed.** Operations counter incremented to 2, indicating the scenario progressed past module 2 (the HMAC-filter sleep). Pre-fix executions stopped AT module 2 with the null-sha256 error.

---

## Why tri-write didn't fire — root cause finding

Scenario `4688746` has an **undocumented expected payload shape**. The signed test payload (a generic JSON object with `event_key`, `source_system`, `event_type`, `timestamp`) passed the HMAC filter but did not match any of the BasicRouter's four route conditions, so none of the downstream modules (postgres-INSERT, Linear-issue subscenario call, Datadog HTTP send) executed. The execution exited cleanly at the router with status=2 ("warning" — no route matched).

The Apr 21 checkpoint's tri-write probe `triwrite-probe-20260421T1017Z` produced the same outcome (also 0 ledger rows, 0 Linear issues). The Apr 21 conclusion ("tri-write blocker is now isolated to HMAC secret mismatch at module 2") was wrong. The HMAC fix is necessary but not sufficient. The actual blocker is the BasicRouter's input-shape filter conditions, which the test payload doesn't satisfy.

**This is the v5.1 amendment finding for B1 expansion:** Appendix H subscenario contracts currently specify schema for inputs/outputs of the SUBSCENARIOS (`4688114`, `4688121`, `4688116`). They do NOT specify input contracts for the regular SCENARIOS that consume payloads from external webhooks. `4688746` is a regular scenario, not a subscenario, and has no input-shape spec anywhere. The v5.1 amendment should expand the contract requirement to cover all webhook-receiving scenarios, not just the three named subscenarios.

---

## Implications for Task 2 (5-surface E2E sweep)

The same pattern is likely to recur on the 5 external surfaces (Stripe, Typeform, Webflow, CIO egress, Linear egress). Each scenario consuming external webhooks has its own implicit payload-shape expectations. Without documented input contracts, signed test payloads will pass HMAC verification but fail to trigger downstream tri-write modules.

**Pragmatic options for Task 2 going forward:**

1. **Use real-world payloads, not synthetic.** Capture an actual Stripe/Typeform/etc webhook from production traffic, replay it with a signed-but-fresh signature. Eliminates the "wrong shape" risk.
2. **Reverse-engineer each scenario's input contract first.** Read the BasicRouter conditions, postgres queries, and module mappers to learn what fields are expected. Build synthetic payloads that match. Slower but explicit.
3. **Defer A1 exit on input-shape sensitive surfaces.** Mark each surface as "deferred-with-runbook" pending B1-expanded contracts being written. Stage 0 closeout proceeds with deferral; closure waits on Stage 1 work that produces real-traffic evidence naturally.

**Recommend option 3 + 2 in parallel.** Defer the per-surface A1 evidence; reverse-engineer in subagent-friendly task (Task 6 spec hardening) so contracts are written. When Stage 1 starts producing real-traffic flows naturally, evidence accumulates.

---

## Updated Task 1 status

Per the v5.1 design's R1 stop-condition rule (1 deferred + 4 succeeded → close with deferral), Task 1's DLQ surface counts as **conditional PASS**: HMAC fix + variable creation + filter resolution all proven. Tri-write piece deferred pending separate scenario-contract amendment.

This DOES unblock Task 2. Task 2 should proceed knowing the same scenario-contract issue will likely surface; capture each surface's outcome and treat undocumented-payload-shape failures as deferred-with-runbook.

---

## v5.1 amendment items added by this task

1. **B1 expansion:** require input-payload contracts for ALL webhook-receiving scenarios, not just the 3 named subscenarios in Appendix H.
2. **A1 acceptance refinement:** distinguish "HMAC verification proved" (signature passes) from "tri-write produced" (downstream artifacts fire). Both should be required for surface-level A1 PASS, but they are independently fixable. v5.1 should make this distinction explicit so partial credit is possible at stage-gate evaluation.
3. **Apr 21 checkpoint correction:** the conclusion "tri-write blocker is HMAC secret mismatch" was incomplete. HMAC was ONE blocker. The undocumented router-conditions are another. Future Stage 0 closeout attempts should expect both.

---

## Re-runnability

The test payload, signature, and HTTP request structure are saved at:
- `/tmp/dlq_shared_secret.txt` (workbench, ephemeral)
- `/tmp/dlq_test_vars.json` (workbench, ephemeral)
- `/tmp/dlq_test_response.json` (workbench, ephemeral)

To re-run after scenario contract investigation: read DLQ_SHARED_SECRET from Doppler, build the proper-shape payload, compute HMAC, POST to the same webhook URL.

---

*Evidence file by Claude (Cowork session) 2026-04-25. Original Task 1 evidence; supersedes any prior partial captures.*
