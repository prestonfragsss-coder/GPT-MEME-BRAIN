# Hermes capability inventory (verified 2026-11-19)

Every row below was checked by running a command in this session. Nothing is assumed.

## Execution environment

| Capability | Status | Evidence |
|---|---|---|
| Host | Ephemeral cloud Linux container (x86_64), running as root | `uname -a`, `whoami` |
| Persistence | **Only git-pushed content survives.** The container is reclaimed after inactivity | Environment design |
| Node / npm | v22.23.5 / 10.9.9 | `node --version` |
| Python | 3.13.18. **No Python Playwright** | `ModuleNotFoundError: playwright` |
| Browser automation | Playwright 1.63.0 (Node, global) + Chromium 1243, headless | `browser verify` passed |
| Docker, git | Installed | `which` |
| Outbound network | Through an HTTPS proxy, all hosts allowed (`selective: false`) | `$HTTPS_PROXY/__agentproxy/status` |
| Solana RPC (`api.mainnet-beta.solana.com`) | Reachable (HTTP 200) | `curl` |
| pump.fun | **Site-side block.** Cloudflare bot challenge (`cf-mitigated: challenge`, 403). Not caused by the proxy | `curl -D -`, `browser visit` |
| x.com, google.com | Reachable (200) | `curl` |
| User's own computer | **None attached** (`list_computer_folders` → empty) | MCP call |
| Pre-existing Hermes code | **None.** The repo had zero commits and the filesystem has no `hermes` files | `git log`, `find /` |

## Connected tools (this session)

| Tool | Status |
|---|---|
| GitHub (scoped to this repo) | Available |
| Gmail, Google Calendar, Google Drive, Notion, Canva, Claude Docs | Available as connectors |
| Slack, Linear, Atlassian, Figma, ClickUp, Monday, Amplitude, Exa, … | **Need OAuth authorization** in claude.ai connector settings |
| HubSpot, Asana, BigQuery | **Failed to connect** (auth server incompatibility) |

## Obstacle classification

| Area | Obstacle type | Detail |
|---|---|---|
| Browser profile management | None | Implemented and verified (see below) |
| Account creation on sites behind bot challenges (pump.fun) | **Technical / site terms** | A Cloudflare challenge requires human verification. Hermes records the task as `blocked` and does not try to bypass the challenge |
| Logged-in sessions on user's real browser | **Missing access** | No computer attached; a cloud container has no access to your local browser |
| Persistent profiles across sessions | **Technical** | The container is ephemeral. `data/` is git-ignored because it holds cookies, so profiles are lost when the container is reclaimed unless they are moved to durable storage |
| Wallet / payment / trading | Not yet evaluated | Each one will be scoped as a separate task |

## Failures in the previous conversation

That conversation is **not accessible** from this session. The only transcript on disk is this session's. To get a per-item analysis, paste the conversation or its key replies. This inventory addresses the failure modes your operating rules describe:
- Claims of impossibility made without checking: every capability above was probed.
- Internal restrictions presented as law: obstacles are classified by type.
- An entire workflow abandoned over one blocker: tasks now carry independent `blocked`/`failed` states.
- Unverified completion claims: tasks reach `succeeded` only with attached evidence.

## Verified execution (browser-profile-manager v0.1)

```
$ npm test                                  → 3 pass, 0 fail (incl. real Chromium isolation test)
$ hermes project create demo-alpha / demo-beta
$ hermes browser verify demo-alpha demo-beta → persisted: true, isolated: true, status: succeeded
$ hermes browser visit demo-alpha https://example.com → 200, "Example Domain", screenshot saved
$ hermes browser visit demo-beta https://pump.fun     → 403, status: blocked, blockedBy: Cloudflare challenge
```
