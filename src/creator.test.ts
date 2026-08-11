import { describe, expect, test } from "bun:test";
import { buildCreatorWorkflow, buildNextActions, buildPackageChecklist, buildSurfaceModel, createCreatorClient, normalizeCreatorSnapshot } from "./creator.ts";

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
      calendar: [],
    });
  });

  test("normalizes package readiness, calendar slots, and sponsor disclosure state", () => {
    const snapshot = normalizeCreatorSnapshot({
      channel: { name: "GMACKO" }, ideas: [], projects: [{ id: "video-1", title: "Launch", status: "editing", format: "long", package: { titleSelected: true, thumbnailSelected: false, hookReady: true, captionsReady: false } }], publishQueue: [],
      contentCalendar: [{ id: "slot-1", projectId: "video-1", title: "Launch", platform: "youtube", date: "2026-08-20", status: "planned" }],
      sponsors: [{ id: "deal-1", name: "Acme", status: "signed" }],
    });
    expect(snapshot.projects[0]).toMatchObject({ package: { titleSelected: true, thumbnailSelected: false, hookReady: true, captionsReady: false } });
    expect(snapshot.calendar).toEqual([{ id: "slot-1", projectId: "video-1", title: "Launch", platform: "youtube", date: "2026-08-20", status: "planned" }]);
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
      expect.objectContaining({ id: "calendar" }),
    ]));
  });

  test("prioritizes a small set of creator next actions with clear destinations", () => {
    const snapshot = normalizeCreatorSnapshot({
      channel: { name: "GMACKO" }, ideas: [{ id: "idea-1", title: "Future build", rung: "spark" }],
      projects: [{ id: "video-1", title: "Launch", status: "editing", format: "long", package: { titleSelected: true, thumbnailSelected: false } }],
      publishQueue: [{ id: "video-2", title: "Ready short", status: "ready" }],
      sponsors: [{ id: "deal-1", name: "Acme", status: "signed" }], calendar: [],
    });
    expect(buildNextActions(snapshot)).toEqual([
      expect.objectContaining({ id: "package:video-1", priority: "now", navigationId: "creator.production" }),
      expect.objectContaining({ id: "publish:video-2", priority: "now", navigationId: "creator.publishing" }),
      expect.objectContaining({ id: "sponsor:deal-1", priority: "now", navigationId: "creator.sponsors" }),
      expect.objectContaining({ id: "idea:idea-1", priority: "later", navigationId: "creator.ideas" }),
    ]);
  });

  test("builds a package review checklist with actionable explanations", () => {
    const snapshot = normalizeCreatorSnapshot({ channel: { name: "GMACKO" }, ideas: [], projects: [{ id: "video-1", title: "Launch", status: "editing", format: "long", package: { titleSelected: true, thumbnailSelected: false, hookReady: true } }], publishQueue: [], sponsors: [{ id: "deal-1", name: "Acme", status: "signed" }], calendar: [] });
    expect(buildPackageChecklist(snapshot, "video-1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "title", status: "complete" }),
      expect.objectContaining({ id: "thumbnail", status: "attention", navigationId: "creator.production" }),
      expect.objectContaining({ id: "hook", status: "complete" }),
      expect.objectContaining({ id: "disclosure", status: "attention", navigationId: "creator.sponsors" }),
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

  test("selects a project and reports its package readiness", () => {
    const workflow = buildCreatorWorkflow(normalizeCreatorSnapshot({ channel: { name: "GMACKO" }, ideas: [], projects: [{ id: "video-1", title: "Launch", status: "editing", format: "long", package: { titleSelected: true, thumbnailSelected: false } }, { id: "video-2", title: "Ready", status: "ready", format: "short", package: { titleSelected: true, thumbnailSelected: true } }], publishQueue: [] }), { projectId: "video-2" });
    expect(workflow.evidence?.[0]).toMatchObject({ status: "positive", detail: expect.stringContaining("Ready") });
  });

  test("loads command-center data through the configured Creator command", async () => {
    const commands: string[][] = [];
    const client = createCreatorClient({ workspaceId: "workspace-1", run: async (command) => { commands.push([...command]); return { channel: { name: "GMACKO" }, ideas: [], projects: [], publishQueue: [] }; } });
    await expect(client.snapshot()).resolves.toMatchObject({ channel: { name: "GMACKO" } });
    expect(commands).toEqual([["video_creator_snapshot", "--workspace", "workspace-1", "--json"]]);
  });
});
