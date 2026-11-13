# T3 Creator plugin

A T3 Code plugin for the Creator OS application (`gmackie/creator`). Creator keeps the domain state. The plugin shows ideas, production, publishing, analytics and sponsors in T3, and gates publishing behind an explicit human approval.

The plugin is an MCP server (`src/mcp.ts`, stdio) described by a v2 manifest (`t3-plugin.json`). The v1 managed-app runtime and plugin RPC were removed in T3CODE-75, so T3 builds that only load v1 manifests can't load this version.

## MCP server

The server is a stdio server on the official MCP TypeScript SDK v2. Its views are MCP Apps: `ui://creator/*.html` resources with the `text/html;profile=mcp-app` MIME type.

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
| `creator_video_approve` | Approve button in the readiness view | app only |
| `creator_video_publish` | Publish button; fails until a human approved. Destructive: a human-only action, as in v1 | app only |

Each tool runs Creator's operator CLI (`video_creator_snapshot --workspace <id> [--projectId <id>] --json`). A missing, failing, slow (30 s) or non-JSON command becomes a short error result. The plugin never shows placeholder data.

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

Install this directory through T3's plugin installer after `bun install --frozen-lockfile`. Then set `CREATOR_COMMAND` (and optionally the publish command and API key) on the connected server. Web, desktop and mobile can all open the panels; mobile uses the server's installation.

See `docs/manifest-v2.md` for the v1 → v2 mapping, the server rules, and the open questions.
