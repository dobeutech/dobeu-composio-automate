# Subscenario: linear-create-exception

## Purpose
Creates Class-4 known-issue in DTS team when automation encounters blocked-but-recoverable errors. Centralizes exception tracking.

## Inputs
| Name | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | One-line issue title |
| `description` | string | yes | Full markdown description |
| `blockerContext` | collection | no | Structured context fields |
| `sourceLabels` | array | no | Additional source/* labels |

## Outputs
| Name | Type | Description |
|---|---|---|
| `issueId` | string | UUID of created Linear issue |
| `identifier` | string | Human ID like DTS-1687 |

## Behavior
1. Auto-applies labels: class/4-known-issue, source/internal, plus sourceLabels
2. Priority=2 (High)
3. Routes to DTS team project
4. Description includes YAML frontmatter with blockerContext

## Stage 2 T2.3 Build Checklist
- [ ] Create scenario `subscenario:linear-create-exception`
- [ ] Use linear-graphql-call sub for issueCreate mutation
- [ ] Hardcode team_id: 86871372-0278-407a-b88f-3232019b3327
- [ ] Label lookup cached in Make data store
- [ ] Export -> commit as `linear-create-exception.json`
