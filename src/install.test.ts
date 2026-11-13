import { expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import manifest from "../t3-plugin.json";
import { FAKE_CREATOR } from "./testing.ts";

it("launches the installed manifest from another directory and serves its panels", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "creator-install-"));
  const root = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
  const transport = new StdioClientTransport({
    command: manifest.mcpServer.transport.command,
    args: manifest.mcpServer.transport.args.map((arg) => arg.replaceAll("${pluginRoot}", root)),
    cwd,
    env: { PATH: process.env.PATH ?? "", CREATOR_COMMAND: FAKE_CREATOR.join(" "), CREATOR_STATE_PATH: join(cwd, "state.json") },
  });
  const client = new Client({ name: "installation-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    for (const panel of manifest.contributes.panels) expect(tools).toContain(panel.tool.name);
    const resources = (await client.listResources()).resources;
    for (const panel of manifest.contributes.panels) {
      expect(resources.some((resource) => resource.uri === panel.resourceUri)).toBe(true);
      const view = await client.readResource({ uri: panel.resourceUri });
      expect(view.contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app" });
      expect(view.contents[0]).toHaveProperty("text", expect.stringContaining("ui/initialize"));
      expect(view.contents[0]).toHaveProperty("text", expect.stringContaining(`data-tool="${panel.tool.name}"`));
    }
    // The opening tool of the command center panel reaches the Creator CLI.
    const result = await client.callTool({ name: "creator_command_center", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ kind: "command-center", channel: "GMACKO" });
  } finally {
    await client.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
