# Hermes

Orchestration workspace. The first component is the **browser profile & project manager**.

## Usage

```bash
node hermes/cli.js project create <slug> --name "Name"
node hermes/cli.js project list
node hermes/cli.js project show <slug>          # manifest, structure check, recent log
node hermes/cli.js browser visit <slug> <url>   # runs in the project's own Chromium profile, saves a screenshot
node hermes/cli.js browser verify <a> <b>       # proves profile persistence + cross-project isolation
node hermes/cli.js tasks [--project s] [--status s]
node hermes/cli.js log <slug>
npm test
```

## Layout (`$HERMES_HOME`, default `./data`, git-ignored)

```
registry/tasks.json                 shared task registry (pending/running/succeeded/failed/blocked + evidence)
projects/<slug>/project.json        manifest
projects/<slug>/browser-profile/    isolated Chromium user-data-dir
projects/<slug>/assets/             screenshots and files
projects/<slug>/credentials/        0700. References only, never committed
projects/<slug>/wallets/            public addresses + ownership records
projects/<slug>/logs/execution.jsonl
```

Agent definition: `.claude/agents/browser-profile-manager.md` (tools: Bash, Read, Glob).
Capability inventory: `docs/capability-inventory.md`.
