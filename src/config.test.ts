import { describe, expect, it } from "bun:test";
import { loadConfig } from "./config.ts";

describe("env config", () => {
  it("maps the v1 settings and runtime env onto env vars", () => {
    expect(
      loadConfig({
        CREATOR_COMMAND: "  pnpm --dir /src/creator  trpc:ops ",
        CREATOR_PUBLISH_COMMAND: "creator-publish",
        CREATOR_WORKSPACE: "gmacko",
        CREATOR_POLL_SECONDS: "120",
        CREATOR_STATE_PATH: "/tmp/creator.json",
      }),
    ).toEqual({
      command: ["pnpm", "--dir", "/src/creator", "trpc:ops"],
      publishCommand: ["creator-publish"],
      workspaceId: "gmacko",
      pollSeconds: 120,
      statePath: "/tmp/creator.json",
    });
  });

  it("applies the old setting defaults and bounds", () => {
    const config = loadConfig({ CREATOR_POLL_SECONDS: "5", XDG_STATE_HOME: "/state" });
    expect(config).toEqual({ command: [], publishCommand: [], workspaceId: "default", pollSeconds: 15, statePath: "/state/t3code-creator-plugin/state.json" });
    expect(loadConfig({ CREATOR_POLL_SECONDS: "99999" }).pollSeconds).toBe(3600);
    expect(loadConfig({ CREATOR_POLL_SECONDS: "soon" }).pollSeconds).toBe(60);
  });
});
