# Dobeu Tech Solutions — System Ownership Declaration

**Version:** 1.0 · **Generated:** 2026-04-20 · **Linear:** DTS-1646 · **Plan:** v3.1

## Purpose

This document is the single source of truth for **who owns what function** across the Dobeu Tech Solutions automation stack. Every system listed below has exactly one primary role and an explicit anti-role. When two systems contend for a function (e.g., "is this data in Airtable or Supabase?"), the ownership table below is the tiebreaker.

## System Ownership Map

| System | Primary Role | Anti-Role (what it is NOT) | Data Destination for |
|---|---|---|---|
| **Linear** | Work control plane; issue tracking with 5-class discipline (Class-1 hot through Class-5 backlog) | NOT an event warehouse; NOT a CRM; NOT durable long-term storage | Tasks, milestones, exceptions, parent/child initiatives |
| **Make.com** | Orchestration mesh — scenario execution, scheduling, retry logic, webhook routing | NOT a connector catalog; NOT durable state storage | Scenario runs, DLQ records (ephemeral) |
| **Composio** | Connector + action layer — unified auth, account selection, cross-system tool execution | NOT a durable backbone; NOT a scheduler | Tool invocation sessions (stateless) |
| **Datadog / Sentry / PostHog** | Telemetry — metrics, errors, session replay, user events | NOT project management; NOT source of truth for work items | Metrics, RUM traces, error streams |
| **Customer.io** | Lifecycle messaging — email/SMS campaigns, journey orchestration | NOT a CRM; NOT a lead-stage warehouse | Message sends, journey milestones |
| **Typeform** | Structured intake — forms, surveys, qualification questionnaires | NOT analytics; NOT a content CMS | Form submissions (sent via webhook) |
| **Airtable** (base `appJwyEYbuBgMINRh`) | Human ops views + Sales CRM (5-table expansion per H3) | NOT a passive data router; NOT a workflow engine | Contacts, Companies, Deals, Activities, Automation Hub |
| **Supabase** | Code-accessed relational data — app backends, RLS-protected reads/writes | NOT an ops UI; NOT a human-facing workspace | App state, user records, transaction logs |
| **Pinecone** (`unified-ai`, `quickstart-skills`, `dobeu-prospect-signals`) | Vector retrieval — embedding search, RAG retrieval, semantic matching | NOT a relational store; NOT a primary source of truth | Vector embeddings (1024-dim cosine) |
| **Doppler** | Secrets vault — credential storage, rotation, injection | NOT config management (use env files for non-sensitive config) | API keys, webhook secrets, service tokens |
| **Cloudflare** | Edge layer — DNS, Workers, R2, Redirect Rules, WAF | NOT a compute host for long-running jobs | DNS records, Worker deployments, R2 buckets |
| **GitHub** (`dobeutech/dobeu-composio-automate`) | Canonical codebase for all Dobeu automation work | NOT a documentation hub (use Linear for task docs) | Source code, Make blueprint backups, infrastructure-as-code |

## Decision Patterns — Resolving Ownership Contention

### Pattern 1: "Where should lead data live?"
- **Active pipeline stage:** Airtable Customer Pipeline (becomes "Deals" table post-Stage-2 T2.7 expansion)
- **Lifecycle messaging history:** Customer.io (message sends, journey progression)
- **Email/outbound interaction history:** Apollo.io (sequences, replies, opens)
- **Closed-won revenue:** Stripe (authoritative payment/subscription state)

### Pattern 2: "Where should task state live?"
- **ALWAYS in Linear** — never duplicate task status across Airtable, GitHub issues, Notion, or anywhere else. Airtable records that reference Linear issues do so via `linear-issue=DTS-XXXX` in their Notes field, not as a parallel status system.

### Pattern 3: "Where should config live?"
- **Sensitive credentials:** Doppler (see T1.5 Part C)
- **Non-sensitive config** (domain map, feature flags, Stripe product IDs): Airtable Domain Registry or Automation Hub
- **Environment-specific overrides:** Cloudflare Workers env vars (bound via wrangler.toml in repo)

### Pattern 4: "Where should logs/events go?"
- **User-facing errors:** Sentry (DSN: `https://5cdd23f613813a79ba7108d52a7a62ee@o4510942828429312.ingest.us.sentry.io/4511252110049280`)
- **Performance + RUM:** Datadog (direct HTTP with both API + Application Key headers — bypass Composio per known reliability issue)
- **Product analytics + session replay:** PostHog
- **Marketing attribution:** Mixpanel (evaluate retirement in Stage 5)

### Pattern 5: "Where should documentation live?"
- **Task-scoped docs:** Linear issue descriptions + comments (per task)
- **Cross-cutting operational docs:** This repo `dobeutech/dobeu-composio-automate` under `/docs/`
- **Customer-facing docs:** Webflow CMS (dobeu.online)
- **Runbooks for manual action:** Generated .docx outputs (see dobeu-manual-steps-runbook-v1.docx)

## 🔒 Customer-Work Exclusion Zone (Permanent Guardrail)

The following assets are **customer work** and MUST NOT be touched by any Dobeu automation, plan task, or agent execution under any circumstances:

- **GitHub Repository:** `https://github.com/dobeutech/agent-usl-website.git` (Unique Staffing Professionals client project)
- **Netlify Project:** UUID `e8cf44e2-089c-4f4c-8b10-1998df378cf7` (production deploy target for above)

**Enforcement:** Tracked as Linear issue DTS-1653 (permanent, does not close). All backup enumeration, registry scans, and Make scenarios explicitly exclude these identifiers.

## Known Schema Gaps Identified During Session

| System | Gap | Impact | Resolution Stage |
|---|---|---|---|
| Airtable Domain Registry | `Purpose` field lacks `Commerce`/`Sprint Funnel` options | Must map to imperfect closest match (`Corporate`/`Redirect/Landing`) | Stage 2 T2.7 (schema amendment) |
| Airtable Domain Registry | `Hosting Platform` field lacks `Framer` option | Framer-hosted subdomains leave field blank | Stage 2 T2.7 |
| Make.com API | `/api/v2/scenarios` endpoint returns 404 via Composio proxy | Full scenario enumeration requires manual web UI export | Documented in runbook; T1.1 partial completion |
| Hyperbrowser | Account email unverified | Browser-automation verification unavailable | Runbook user-action item |

## Revision History

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-04-20 | Initial declaration per T1.2 / DTS-1646 | Dobeutech (via agent execution) |

---

*This document is generated automatically. To propose changes, open an issue in this repo tagged `ownership-change` or comment on DTS-1646.*
