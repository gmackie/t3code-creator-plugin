import { describe, expect, test } from "bun:test";
import { buildCreatorWorkflow, buildSurfaceModel, createCreatorClient, normalizeCreatorSnapshot } from "./creator.ts";

describe("Creator adapter", () => {
  test("normalizes command-center content without inventing metrics", () => {
    expect(normalizeCreatorSnapshot({
      channel: { name: "GMACKO", subscribers: 1200 },
      ideas: [{ id: "idea-1", title: "Build log", rung: "package" }],
      projects: [{ id: "video-1", title: "Build log", status: "editing", format: "long" }],
      publishQueue: [{ id: "video-1", title: "Build log", status: "ready" }],
      analytics: { ctr: null },
    })).toEqual({
      channel: { name: "GMACKO", subscribers: 1200 },
      ideas: [{ id: "idea-1", title: "Build log", rung: "package" }],
      projects: [{ id: "video-1", title: "Build log", status: "editing", format: "long" }],
      publishQueue: [{ id: "video-1", title: "Build log", status: "ready" }],
      analytics: { ctr: null },
      sponsors: [],
    });
  });

  test("builds a creator command-center surface", () => {
    const surface = buildSurfaceModel(normalizeCreatorSnapshot({
      channel: { name: "GMACKO" },
      ideas: [{ id: "idea-1", title: "Next video", rung: "spark" }],
      projects: [],
      publishQueue: [{ id: "video-1", title: "Ready to publish", status: "ready" }],
    }));
    expect(surface.navigationId).toBe("creator.command-center");
    expect(surface.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ideas" }),
      expect.objectContaining({ id: "publish-queue" }),
    ]));
  });

  test("builds a readiness workflow that highlights packaging gaps", () => {
    const workflow = buildCreatorWorkflow(normalizeCreatorSnapshot({
      channel: { name: "GMACKO" },
      ideas: [],
      projects: [{ id: "video-1", title: "Ready", status: "editing", format: "long" }],
      publishQueue: [],
    }));
    expect(workflow.workflowId).toBe("creator.video-readiness");
    expect(workflow.currentStage).toBe("review");
    expect(workflow.evidence?.[0]).toMatchObject({ status: "warning" });
    expect(workflow.actions?.[0]?.id).toBe("approve");
  });

  test("loads command-center data through the configured Creator command", async () => {
    const commands: string[][] = [];
    const client = createCreatorClient({ workspaceId: "workspace-1", run: async (command) => { commands.push([...command]); return { channel: { name: "GMACKO" }, ideas: [], projects: [], publishQueue: [] }; } });
    await expect(client.snapshot()).resolves.toMatchObject({ channel: { name: "GMACKO" } });
    expect(commands).toEqual([["video_creator_snapshot", "--workspace", "workspace-1", "--json"]]);
  });
});
