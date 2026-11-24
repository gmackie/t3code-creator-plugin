# T3 Creator plugin

A T3 Code plugin for the Creator OS application (`gmackie/creator`). Creator keeps the domain state. The plugin shows ideas, production, publishing, analytics and sponsors in T3, and gates publishing behind an explicit human approval.

Install the v2 manifest in T3 and sign in under **Settings → Tools → creator**. T3 connects to `https://creator.gmac.io/mcp`. Choose a workspace and grant `mcp:read` to open its nine panels. `offline_access` lets T3 renew the connection.

## MCP server

Creator serves the `ui://creator/*.html` views as `text/html;profile=mcp-app`. During consent you can also select `creator:approve` to open a signed-in package confirmation and `creator:publish` to queue an approved package.

| Tool | View / panel | Visibility |
|---|---|---|
| `creator_command_center` | `creator-command-center` (project): pipeline counts and next best actions | model, app |
| `creator_publish_queue` | `creator-publish-queue` (project) | model, app |
| `creator_content_calendar` | `creator-content-calendar` (project) | model, app |
| `creator_analytics` | `creator-analytics` (project): CTR, views, AVD and a directional diagnosis | model, app |
| `creator_idea_ladder` | `creator-idea-ladder` (project) | model, app |
| `creator_sponsor_deal_room` | `creator-sponsors` (project): active deals and disclosure gates | model, app |
| `creator_package_review` | `creator-package-review` and `creator-publish-checks` (thread): title, thumbnail, hook, captions, disclosure | model, app |
| `creator_video_readiness` | `creator-video-readiness` (thread): the readiness workflow | model, app |
| `creator_video_approve` | Opens the signed-in package approval from the readiness view | app only |
| `creator_video_publish` | Queues a human-approved package | app only |

## Standalone stdio operator

The standalone `bun run mcp` entry point runs Creator's operator CLI (`video_creator_snapshot --workspace <id> [--projectId <id>] --json`). A missing, failing, slow (30 s) or non-JSON command becomes a short error result. The plugin never shows placeholder data.

### Configuration

| Env var | v1 | Notes |
|---|---|---|
| `CREATOR_COMMAND` | `T3_PLUGIN_COMMAND` | required, e.g. `pnpm --dir /path/to/creator trpc:ops` |
| `CREATOR_PUBLISH_COMMAND` | `T3_PLUGIN_PUBLISH_COMMAND` | called with `--project-id <id> --json`; must print `{"status":"published"\|"scheduled"}` |
| `CREATOR_WORKSPACE` | `creator.workspace` | default `default` |
| `GMACKO_API_URL` | (inherited) | passed to the Creator CLI |
| `GMACKO_API_KEY` | (inherited) | secret, passed to the Creator CLI |
| `CREATOR_POLL_SECONDS` | `creator.polling-seconds` | 15–3600, default 60 |
| `CREATOR_STATE_PATH` | `T3_PLUGIN_STATE_FILE` | approval state, default `$XDG_STATE_HOME/t3code-creator-plugin/state.json`, shared by every plugin process |

### Run it

```sh
bun install
bun test                       # domain, MCP client, AppBridge interop, DOM view and install tests
bun run typecheck
bun run inspect                # MCP Inspector, against scripts/fake-creator.ts unless CREATOR_COMMAND is set
```

For the standalone operator, set `CREATOR_COMMAND` and any required API or publish configuration in the process environment.

See `docs/manifest-v2.md` for the v1 → v2 mapping, the server rules, and the open questions.
