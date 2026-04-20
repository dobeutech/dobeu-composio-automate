# Subscenario: linear-graphql-call

## Purpose
Reusable Linear GraphQL executor. Abstracts authentication, retry logic, and error handling.

## Inputs
| Name | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | GraphQL query or mutation body |
| `variables` | collection | no | Variables object |

## Outputs
| Name | Type | Description |
|---|---|---|
| `data` | collection | Response `data` field |
| `success` | boolean | true if no errors array |
| `errors` | array | GraphQL errors if present |

## Behavior
1. Receive query + variables from calling scenario
2. POST to https://api.linear.app/graphql with Linear auth header
3. Parse response; emit output tuple

## Failure Handling
- HTTP 5xx: retry 3x with exponential backoff (2s, 4s, 8s)
- HTTP 4xx: fail immediately, emit to DLQ
- GraphQL errors: treat as failure, emit to DLQ

## Stage 2 T2.3 Build Checklist
- [ ] Create blank scenario in Make UI named `subscenario:linear-graphql-call`
- [ ] Add BasicFeeder trigger with parameters per Inputs table
- [ ] Add HTTP module per Behavior section
- [ ] Test with no-op query: `query { viewer { id name } }`
- [ ] Export blueprint JSON -> commit as `linear-graphql-call.json`
