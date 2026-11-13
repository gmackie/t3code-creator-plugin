#!/usr/bin/env bun
// Stdio entry point for the MCP-native Creator plugin (manifest v2 `mcpServer`).
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createCommandRunner } from "./commands.ts";
import { loadConfig } from "./config.ts";
import { createCreatorClient } from "./creator.ts";
import { createCreatorMcpServer } from "./server.ts";
import { fileStateStore } from "./state.ts";

const config = loadConfig();
const creator = createCreatorClient({
  workspaceId: config.workspaceId,
  run: createCommandRunner(config.command, { label: "Creator command", setting: "CREATOR_COMMAND" }),
});
const publish = createCommandRunner(config.publishCommand, { label: "Creator publish command", setting: "CREATOR_PUBLISH_COMMAND" });

const server = createCreatorMcpServer({
  snapshot: (projectId) => creator.snapshot(projectId),
  publish: (projectId) => publish(["--project-id", projectId, "--json"]),
  state: fileStateStore(config.statePath),
  pollSeconds: config.pollSeconds,
});
await server.connect(new StdioServerTransport());
