# Subscenario: linear-write-milestone

## Purpose
Creates Linear project milestone with idempotency (won't duplicate existing milestone name).

## Inputs
| Name | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | yes | UUID of target Linear project |
| `name` | string | yes | Milestone display name |
| `targetDate` | string | no | ISO date YYYY-MM-DD |
| `description` | string | no | Markdown description |

## Outputs
| Name | Type | Description |
|---|---|---|
| `milestoneId` | string | UUID of created or existing milestone |
| `success` | boolean | true if create OR existing-match |
| `wasCreated` | boolean | true if new; false if existing found |

## Behavior
1. Query existing milestones via linear-graphql-call sub
2. If name matches: return existing ID, wasCreated=false
3. Otherwise: call projectMilestoneCreate, return new ID

## Stage 2 T2.3 Build Checklist
- [ ] Create scenario `subscenario:linear-write-milestone`
- [ ] 2-step flow: query existing via linear-graphql-call sub, conditional create
- [ ] Use Make Router for conditional branch
- [ ] Export blueprint -> commit as `linear-write-milestone.json`
