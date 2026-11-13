import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { FAKE_CREATOR, connectedClient } from "../testing.ts";
import type { CallToolResult, ViewBridge } from "./bridge.ts";
import { mountView } from "./controller.ts";

// Runs the view controller against a DOM, with the test acting as the host and
// forwarding tools/call to the Creator MCP server (backed by the fake CLI).
async function setup(tool: string, options: Parameters<typeof connectedClient>[0] = {}) {
  const { client, published } = await connectedClient(options);
  const win = new Window({ url: "https://view.invalid/" });
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const bridge = {
    async callTool(name: string, args: Record<string, unknown> = {}) {
      calls.push({ name, args });
      return (await client.callTool({ name, arguments: args })) as CallToolResult;
    },
  } as ViewBridge;
  win.document.body.innerHTML = `<main id="app">Loading…</main>`;
  const root = win.document.getElementById("app") as unknown as HTMLElement;
  const view = mountView(bridge, root, tool, { visibilityState: "visible" });
  const deliver = async (args: Record<string, unknown> = {}) => {
    bridge.onToolInput?.(args);
    bridge.onToolResult?.((await client.callTool({ name: tool, arguments: args })) as CallToolResult);
  };
  const settle = () => Bun.sleep(150);
  const click = (selector: string) => (root.querySelector(selector) as HTMLElement).click();
  return { root, view, calls, published, deliver, settle, click, win };
}

describe("view controller in a DOM", () => {
  it("approves and publishes from the video readiness view", async () => {
    const { root, calls, published, deliver, settle, click } = await setup("creator_video_readiness");
    await deliver({ projectId: "video-2" });
    expect(root.querySelector(".subject strong")?.textContent).toBe("review");
    expect(root.querySelector(".subject")?.textContent).toContain("Shorts: <script> tips");
    expect(root.querySelector("script")).toBeNull();

    click("[data-action=approve]");
    await settle();
    expect(root.querySelector(".subject strong")?.textContent).toBe("execute");

    click("[data-action=publish]");
    await settle();
    expect(root.querySelector(".notice")?.textContent).toBe("Video scheduled for 2026-11-20T17:00:00.000Z.");
    expect(root.querySelector("[data-action=publish]")).toBeNull();
    expect(published).toEqual(["video-2"]);
    expect(calls.map((call) => call.name)).toEqual(["creator_video_approve", "creator_video_readiness", "creator_video_publish"]);
  });

  it("switches projects in the package review", async () => {
    const { root, calls, deliver, settle } = await setup("creator_package_review");
    await deliver();
    const select = root.querySelector("[data-role=project]") as HTMLSelectElement;
    expect(select.value).toBe("video-1");
    select.value = "video-2";
    select.dispatchEvent(new (select.ownerDocument.defaultView as unknown as typeof globalThis).Event("change", { bubbles: true }));
    await settle();
    expect(calls).toEqual([{ name: "creator_package_review", args: { projectId: "video-2" } }]);
    expect(root.querySelector(".subject")?.textContent).toContain("Shorts");
  });

  it("shows the setup error from a failing tool and retries on demand", async () => {
    const { root, view, calls, settle, click } = await setup("creator_command_center", { command: [] });
    await view.refresh();
    expect(root.querySelector("[role=alert]")?.textContent).toBe("Creator command is not configured: set CREATOR_COMMAND in the plugin settings.");
    click("[data-action=refresh]");
    await settle();
    expect(calls).toHaveLength(2);
  });

  it("shows an upstream failure delivered as the panel's tool result", async () => {
    const { root, view, deliver } = await setup("creator_publish_queue", { command: [...FAKE_CREATOR, "--mode", "fail"] });
    await deliver();
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Creator command failed");
    expect(view.hasData()).toBe(true);
  });
});
