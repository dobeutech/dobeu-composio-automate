# Make.com Subscenario Skeletons

Reusable Make.com scenario blueprints for DTS automation workflows. Each skeleton is a minimal, callable subscenario referenced from parent scenarios via the "Run a scenario" module.

## Skeletons Available

| File | Purpose | Inputs | Outputs |
|---|---|---|---|
| `linear-graphql-call.spec.md` | Reusable Linear GraphQL executor | query, variables | data, success, errors |
| `linear-write-milestone.spec.md` | Creates milestone on Linear project | projectId, name, targetDate | milestoneId, success |
| `linear-create-exception.spec.md` | Creates Class-4 known-issue in DTS team | title, description, blockerContext | issueId, identifier |

## Deployment Procedure

1. Log into https://us1.make.com/ with DTS team context (team_id 315584)
2. Create new scenario -> Import blueprint -> select skeleton JSON
3. Map connection credentials to existing Make connections
4. Enable scheduled trigger OR leave as manually-triggered subscenario
5. Copy scenario ID -> add to parent scenarios via "Run a scenario" module

## Development Status

These specs are Stage 2 T2.3 PRECURSOR deliverables. Full blueprint implementation proceeds in Make web UI once T1.7 (Rube sunset date) is confirmed.

## Linear References

- DTS-1642 (v3 Stage 1 Foundation parent)
