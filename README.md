# dobeu-composio-automate

Automation architect configuration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with Composio, Make.com, Rube, and native MCP orchestration.

## What this is

A ready-to-clone project that configures Claude Code as an **automation architect** — an agent that not only completes tasks but continuously identifies automation opportunities, detects underused connections, and designs cross-system workflows.

## Quick start

```bash
git clone https://github.com/dobeutech/dobeu-composio-automate.git
cd dobeu-composio-automate
claude
```

Claude Code will automatically read `CLAUDE.md` and operate with the full automation architect behavior.

## Architecture

### Two-layer prompt stack

| Layer | File | Purpose |
|-------|------|---------|
| Master operating manual | `CLAUDE.md` | Full behavioral spec — tool routing, session management, execution policy, cross-system detection |
| Compact directive | `Append_system_prompt` | 6-line behavioral reinforcement for append/system prompt slots |

### Tool routing decision tree

The agent follows a strict priority order:

1. **Native MCP** → for single-app actions (Gmail, Calendar, Drive, Linear, etc.)
2. **Composio** → for cross-system orchestration (2+ apps)
3. **Composio/Rube workbench** → for bulk execution and large data
4. **Make.com** → for persistent scheduled workflows
5. **Composio catalog** → for tools not available via native MCP
6. **Rube** → fallback discovery with separate session space
7. **Shell** → only when no MCP integration exists

### Agent checkpoint system

The `.agent/` directory provides cross-platform handoff state:

```
.agent/
├── progress.md    # Session log with completed features and next steps
├── tasks.json     # Structured task list with status tracking
└── state.json     # Environment snapshot for session resume
```

## Key capabilities

- **Cross-system opportunity detection** — after every task, identifies automation gaps between connected systems
- **Multi-account routing** — handles personal vs work, client A vs B, prod vs sandbox
- **Session management** — creates/reuses Composio sessions based on workflow boundaries
- **Workbench routing** — offloads bulk ops and large data to remote sandboxes
- **Auth fallback cascade** — checks alternate systems before requesting new connections
- **Trigger design** — recommends webhook vs polling based on source capabilities

## Connected systems support

Designed to orchestrate across:

- **Native MCP**: Gmail, Google Calendar, Google Drive, Linear, Intercom, Netlify, Supabase, Apollo.io, Canva, PostHog
- **Composio**: 500+ apps including Slack, GitHub, Notion, Figma, Stripe, Discord, Dropbox, and more
- **Make.com**: Visual workflow builder with scenario management, webhooks, and data stores
- **Rube**: Independent MCP server with separate workbench sandbox

## File reference

| File | Description |
|------|-------------|
| `CLAUDE.md` | Master operating manual — Claude Code reads this automatically |
| `Append_system_prompt` | Compact behavioral directive for system prompt append |
| `Append_system_prompt.md` | Extended version with full Composio session and auth guidance |
| `.claude/settings.json` | Claude Code project-level settings |
| `.agent/progress.md` | Session progress tracking |
| `.agent/tasks.json` | Structured task management |
| `.agent/state.json` | Environment state for handoffs |

## License

MIT
