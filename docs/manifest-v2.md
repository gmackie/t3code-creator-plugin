# Creator manifest v2 (T3CODE-75)

`t3-plugin.json` follows the MCP-native plugin model approved on T3CODE-74 and first shipped by the Bob plugin (v0.2.1). T3 loads it into its server-owned MCP registry. It decodes against `McpPluginManifest` in `packages/contracts/src/mcpPlugin.ts`.

## Shape

- `mcpServer` reuses `McpServerConfig` and `McpServerVariable` from Settings → Tools:
  - `name`: `creator`.
  - `transport`: stdio, `bun ${pluginRoot}/src/mcp.ts`, with `env` as `McpServerVariable[]`. `GMACKO_API_KEY` is `sensitive`.
- `contributes.panels[]`: one `ui://creator/*.html` view per panel, each with an opening `tool`, so a panel shows the same data the tool renders inline.
- `contributes.commands[]` replace v1 `navigation` and open the matching panel.
- `t3Tools` is `[]`. Creator never calls back into T3, and v1 never asked for a T3 capability.

The real data source is Creator's operator CLI (`video_creator_snapshot` in `packages/operator-core`). The plugin spawns `CREATOR_COMMAND` without a shell, bounds each run at 30 s, and parses its JSON. When the command is unset, fails, times out or prints something other than JSON, the tool returns an error result with one short line: no stack traces, no URLs, no empty placeholder data.

## v1 → v2 mapping

The last v1 manifest is at commit 7e0bf79.

| v1 | v2 |
|---|---|
| `runtime` (managed-app, `bun src/stdio.ts`, plugin RPC `surface.get`/`panel.get`/`workflow.get`/`action.execute`) | `mcpServer.transport` (stdio, `bun ${pluginRoot}/src/mcp.ts`) |
| `navigation[creator.command-center]` | Command `creator-open-command-center` → panel `creator-command-center` |
| `navigation[creator.ideas]` | Command `creator-open-ideas` → panel `creator-idea-ladder` |
| `navigation[creator.production]` | Command `creator-open-production` → panel `creator-package-review` |
| `navigation[creator.publishing]` | Command `creator-open-publishing` → panel `creator-publish-queue` |
| `navigation[creator.analytics]` | Command `creator-open-analytics` → panel `creator-analytics` |
| `navigation[creator.sponsors]` | Command `creator-open-sponsors` → panel `creator-sponsors` |
| `navigation[creator.library]` | Removed. v1 served no media library data and Creator's snapshot has none. |
| `panels[creator.command-center]` (project) | Panel `creator-command-center`, `scope: project`, tool `creator_command_center` |
| `panels[creator.publish-checks]` (thread.sidePanel) | Panel `creator-publish-checks`, `scope: thread`, the package review view. v1 declared it but its RPC never served it. |
| `panels[creator.publish-queue]` (project) | Panel `creator-publish-queue`, `scope: project`, tool `creator_publish_queue` |
| `panels[creator.content-calendar]` (project) | Panel `creator-content-calendar`, `scope: project`, tool `creator_content_calendar` |
| `panels[creator.analytics]` (project) | Panel `creator-analytics`, `scope: project`, tool `creator_analytics` |
| `panels[creator.idea-ladder]` (project) | Panel `creator-idea-ladder`, `scope: project`, tool `creator_idea_ladder` |
| `panels[creator.sponsors]` (project) | Panel `creator-sponsors`, `scope: project`, tool `creator_sponsor_deal_room` |
| `panels[creator.package-review]` (thread.sidePanel) | Panel `creator-package-review`, `scope: thread`, tool `creator_package_review` |
| `workflows[creator.video-readiness]` (thread.main) | Tool `creator_video_readiness` with `ui://creator/video-readiness.html`, also panel `creator-video-readiness` (`scope: thread`) |
| `action.execute` `approve` | Tool `creator_video_approve`, `visibility: ["app"]` |
| `action.execute` `publish` | Tool `creator_video_publish`, requires a recorded approval |
| `settings[creator.workspace]` | `CREATOR_WORKSPACE` |
| `settings[creator.polling-seconds]` | `CREATOR_POLL_SECONDS` (clamped to 15–3600, default 60) |
| `settingsPanels[creator.connection]` | Dropped: the variables carry their own titles and descriptions |
| Runtime env `T3_PLUGIN_COMMAND` | `CREATOR_COMMAND` |
| Runtime env `T3_PLUGIN_PUBLISH_COMMAND` | `CREATOR_PUBLISH_COMMAND` |
| Runtime env `T3_PLUGIN_STATE_FILE` | `CREATOR_STATE_PATH` |
| Runtime env `T3_PLUGIN_WORKSPACE` | `CREATOR_WORKSPACE` |
| Runtime env `T3_PLUGIN_SNAPSHOT` (static fallback snapshot) | Removed. Without `CREATOR_COMMAND` the tools say so instead of showing an empty or canned pipeline. |
| (CLI env, previously inherited) | `GMACKO_API_URL`, `GMACKO_API_KEY` (sensitive), passed through to the Creator commands |
| `hooks: turn.settled, runtime.error` | Removed (D4). v1's runtime declared them but never handled either event, so no behaviour is lost. Views refresh on `CREATOR_POLL_SECONDS` instead. |
| `capabilities.filesystem.read` (project.root) | Dropped: v1 never read project files |
| `capabilities.network.connect` (creator.forgegraf.com, googleapis) | Dropped: the Creator CLI makes those calls; views go through `tools/call` |
| `capabilities.ui.embed` | Implied by `panels` |

## Server rules

- **Visibility.**
  - Every view tool (`creator_command_center`, `creator_publish_queue`, `creator_content_calendar`, `creator_analytics`, `creator_idea_ladder`, `creator_sponsor_deal_room`, `creator_package_review`, `creator_video_readiness`, `creator_video_publish`) is `["model", "app"]`.
  - `creator_video_approve` is `["app"]`, so only a human in a view can approve a package. `creator_video_publish` fails until that approval exists, and refuses a second publish.
  - A publish only counts when the publish command reports `published` or `scheduled`. Anything else is an error, and approval is kept so the human can retry.
- **No T3 token needed.** Only the pool copy gets `T3_MCP_URL`/`T3_MCP_TOKEN`. Creator doesn't use them, so every copy behaves the same.
- **Stateless processes.** T3 runs one stdio copy per agent session plus one in its pool. The approval from a panel (pool copy) and the agent's publish (session copy) can run in different processes. Approvals therefore live in one JSON file per machine, keyed by Creator project id, at `CREATOR_STATE_PATH` (default `$XDG_STATE_HOME/t3code-creator-plugin/state.json`). Writes go to a temp file and are renamed into place. `server.test.ts` approves in one copy and publishes from another.

## Open questions

1. **Thread panels.** `creator-package-review`, `creator-publish-checks` and `creator-video-readiness` are thread-scoped like their v1 surfaces, but T3 threads have no Creator project id. They open on Creator's newest project and offer a picker.
2. **Shared state file.** As with Bob, approvals assume every copy sees the same `HOME`/`XDG_STATE_HOME`. Concurrent approvals of different projects can race on the file. The approval is then lost and has to be redone, but it is never invented.
3. **Publish command.** Creator's operator CLI deliberately has no publish tool ("HITL; no publish"). `CREATOR_PUBLISH_COMMAND` keeps v1's contract (`--project-id <id> --json` → `{ "status": "published" | "scheduled" }`) and is empty by default.
