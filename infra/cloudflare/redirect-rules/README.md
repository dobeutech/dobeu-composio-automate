# Cloudflare Redirect Rules

Deployable Cloudflare Rulesets for Dobeu domain routing.

## Rules Available

| File | Source | Target | Zone | Status |
|---|---|---|---|---|
| `dobeu-website-to-launch.json` | dobeu.website | launch.dobeu.net | `68680c56d82a684dc9ade23d73074b9b` | DRAFT |

## Deployment Procedure

### Prerequisites
1. launch.dobeu.net has live DNS + SSL
2. CF_API_TOKEN env var (scope: Zone.Zone.Edit)

### Step 1: Verify no conflicting rulesets
```bash
curl -X GET "https://api.cloudflare.com/client/v4/zones/68680c56d82a684dc9ade23d73074b9b/rulesets/phases/http_request_dynamic_redirect/entrypoint" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result.rules'
```

### Step 2: Create ruleset entrypoint
```bash
curl -X PUT "https://api.cloudflare.com/client/v4/zones/68680c56d82a684dc9ade23d73074b9b/rulesets/phases/http_request_dynamic_redirect/entrypoint" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @dobeu-website-to-launch.json
```

### Step 3: Validate
```bash
curl -sI "https://dobeu.website/test" | grep -E "^(HTTP|location)"
# Expected: HTTP/2 301, location: https://launch.dobeu.net/test
```

### Step 4: Confirm DNS preservation
```bash
dig dobeu.website MX +short
# Expected: dobeu-website.mail.protection.outlook.com
```

## Critical Safety Invariants

- DO NOT modify DNS records on dobeu.website zone
- 16 email records must persist (MX, DKIM, SPF, autodiscover, Teams/Lync SRV)
- HTTP-layer redirect only - email continues via preserved MX
- Rollback: DELETE the ruleset entrypoint

## Linear References
- DTS-1643 (Platform/domain allocation - T1.4)
- DTS-1642 parent - v3.1 plan Stage 3 T3.11
