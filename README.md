# T3 Creator plugin

Desktop/server-side T3 adapter for the Creator OS application at `/Volumes/dev/creator`.

The plugin keeps Creator domain state in Creator and exposes normalized T3 surfaces:

- command center for ideas, production, publishing, analytics, sponsors, and media;
- video readiness workflow with explicit human approval;
- publish callback through a configured Creator command;
- restart-safe workflow state via `T3_PLUGIN_STATE_FILE`.

Configure `T3_PLUGIN_COMMAND` to a Creator command that accepts `command-center --workspace <id> --json` and returns the command-center snapshot. Configure `T3_PLUGIN_PUBLISH_COMMAND` for explicit publish/schedule actions.
