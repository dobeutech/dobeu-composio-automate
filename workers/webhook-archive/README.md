# webhook-archive Worker

Cloudflare Worker fronting Make.com webhook ingress for Dobeu-Eco v5.
Archives raw payloads to R2, verifies HMAC per Appendix I, fails open to Make
on R2 errors, canary-routes test payloads to `canary/` R2 prefix.

**Ingress sources** (8): stripe, typeform, intercom, apollo, posthog, linear, webflow, rube
**Deploy:** see `Implementation/v5-cf-worker-deploy-runbook.md` in the Dobeu-Eco workspace
**HMAC matrix:** see `Implementation/v5-final-consolidated-plan.md` Appendix I
**Source of truth:** this repo; Drive `/dobeu-eco/Implementation/` mirrors the plan markdown.

v5.0 · 2026-04-20 · DTS-CF-WORKER
