import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import {
  buildAnalyticsDiagnosis,
  buildCreatorWorkflow,
  buildIdeaLadderModel,
  buildNextActions,
  buildPackageChecklist,
  buildSponsorDealRoomModel,
  buildSurfaceModel,
  type CreatorSnapshot,
} from "./creator.ts";
import type { CreatorStateStore } from "./state.ts";
import { VIEWS, viewHtml, type ViewName } from "./views/html.ts";
import type { VideoReadinessData, ViewData } from "./views/render.ts";

export const SERVER_INFO = { name: "creator", version: "0.2.0" } as const;

export type PublishResult = { status: "published" | "scheduled"; publishAt?: string };

export type CreatorServerOptions = {
  snapshot(projectId?: string): Promise<CreatorSnapshot>;
  publish(projectId: string): Promise<unknown>;
  state: CreatorStateStore;
  pollSeconds: number;
};

const projectId = z.string().min(1).describe("Creator video project id");
const optionalProject = z.object({ projectId: projectId.optional().describe("Creator video project id; defaults to the newest project") });
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;
const both = (view: ViewName) => ({ ui: { resourceUri: VIEWS[view].uri, visibility: ["model", "app"] as ("model" | "app")[] } });

export function createCreatorMcpServer(options: CreatorServerOptions): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Creator is the user's video command center (ideas, production, publishing, analytics, sponsors). Use creator_command_center for the next best actions, the panel tools for detail, and creator_video_readiness before publishing. Only a human can approve and publish a package, from the video readiness view.",
  });

  const base = (snapshot: CreatorSnapshot) => ({ channel: snapshot.channel.name, refreshedAt: new Date().toISOString(), pollSeconds: options.pollSeconds });

  for (const [name, view] of Object.entries(VIEWS) as [ViewName, (typeof VIEWS)[ViewName]][]) {
    registerAppResource(server, view.title, view.uri, { mimeType: RESOURCE_MIME_TYPE, _meta: { ui: { prefersBorder: true } } }, async () => ({
      contents: [{ uri: view.uri, mimeType: RESOURCE_MIME_TYPE, text: await viewHtml(name), _meta: { ui: { prefersBorder: true } } }],
    }));
  }

  registerAppTool(
    server,
    "creator_command_center",
    {
      title: "Creator command center",
      description: "Pipeline counts (ideas, production, publish queue, calendar) and the next best creator actions. Renders the command center view.",
      inputSchema: optionalProject,
      annotations: readOnly,
      _meta: both("commandCenter"),
    },
    async ({ projectId: id }) =>
      result(async () => {
        const snapshot = await options.snapshot(id);
        const nextActions = buildNextActions(snapshot);
        const data: ViewData = { kind: "command-center", ...base(snapshot), surface: buildSurfaceModel(snapshot), nextActions };
        const metrics = data.surface.cards.filter((card) => card.kind === "metric").map((card) => `${card.title}: ${card.value}`);
        return { data, text: `${snapshot.channel.name}: ${metrics.join(", ")}.\nNext actions:\n${nextActions.map((action) => `- [${action.priority}] ${action.title} (${action.reason})`).join("\n") || "- none"}` };
      }),
  );

  registerAppTool(
    server,
    "creator_publish_queue",
    { title: "Creator publish queue", description: "Videos queued for publishing with their status and publish time.", inputSchema: z.object({}), annotations: readOnly, _meta: both("publishQueue") },
    async () =>
      result(async () => {
        const snapshot = await options.snapshot();
        const data: ViewData = { kind: "publish-queue", ...base(snapshot), items: snapshot.publishQueue };
        return { data, text: lines(`${snapshot.publishQueue.length} queued videos.`, snapshot.publishQueue.map((item) => `${item.id} [${item.status}] ${item.title}${item.publishAt ? ` @ ${item.publishAt}` : ""}`)) };
      }),
  );

  registerAppTool(
    server,
    "creator_content_calendar",
    {
      title: "Creator content calendar",
      description: "Upcoming content calendar slots (platform, date, status) for a project.",
      inputSchema: optionalProject,
      annotations: readOnly,
      _meta: both("contentCalendar"),
    },
    async ({ projectId: id }) =>
      result(async () => {
        const snapshot = await options.snapshot(id);
        const data: ViewData = { kind: "content-calendar", ...base(snapshot), slots: snapshot.calendar };
        return { data, text: lines(`${snapshot.calendar.length} calendar slots.`, snapshot.calendar.map((slot) => `${slot.date} ${slot.platform} [${slot.status}] ${slot.title}`)) };
      }),
  );

  registerAppTool(
    server,
    "creator_analytics",
    { title: "Creator analytics", description: "Channel CTR, views and average view duration with a directional bottleneck diagnosis.", inputSchema: z.object({}), annotations: readOnly, _meta: both("analytics") },
    async () =>
      result(async () => {
        const snapshot = await options.snapshot();
        const diagnosis = buildAnalyticsDiagnosis(snapshot.analytics);
        const data: ViewData = { kind: "analytics", ...base(snapshot), metrics: snapshot.analytics ?? { ctr: null }, diagnosis };
        return { data, text: `${diagnosis.title}: ${diagnosis.reason} Next: ${diagnosis.nextAction}.` };
      }),
  );

  registerAppTool(
    server,
    "creator_idea_ladder",
    { title: "Creator idea ladder", description: "Ideas grouped by rung (spark, proof, package, production, publish) with the next step for each.", inputSchema: z.object({}), annotations: readOnly, _meta: both("ideaLadder") },
    async () =>
      result(async () => {
        const snapshot = await options.snapshot();
        const stages = buildIdeaLadderModel(snapshot);
        const data: ViewData = { kind: "idea-ladder", ...base(snapshot), stages };
        return { data, text: stages.map((stage) => `${stage.title}: ${stage.count}${stage.items.length ? ` (${stage.items.map((item) => item.title).join(", ")})` : ""}`).join("\n") };
      }),
  );

  registerAppTool(
    server,
    "creator_sponsor_deal_room",
    { title: "Creator sponsor deal room", description: "Active sponsor deals and which still need a disclosure before publishing.", inputSchema: z.object({}), annotations: readOnly, _meta: both("sponsors") },
    async () =>
      result(async () => {
        const snapshot = await options.snapshot();
        const room = buildSponsorDealRoomModel(snapshot);
        const data: ViewData = { kind: "sponsor-deal-room", ...base(snapshot), ...room };
        return { data, text: lines(`${room.totals.active} active deals, ${room.totals.needsDisclosure} need disclosure, ${room.totals.delivered} delivered.`, room.deals.map((deal) => `${deal.name} [${deal.status}]: ${deal.nextAction}`)) };
      }),
  );

  registerAppTool(
    server,
    "creator_package_review",
    {
      title: "Creator package review",
      description: "Publish checks for one video project: title, thumbnail, hook, captions and sponsor disclosure.",
      inputSchema: optionalProject,
      annotations: readOnly,
      _meta: both("packageReview"),
    },
    async ({ projectId: id }) =>
      result(async () => {
        const snapshot = await options.snapshot(id);
        const project = findProject(snapshot, id);
        const checks = buildPackageChecklist(snapshot, project?.id);
        const data: ViewData = { kind: "package-review", ...base(snapshot), projects: projectOptions(snapshot), checks, ...(project ? { projectId: project.id, projectTitle: project.title } : {}) };
        return { data, text: lines(project ? `Package review for "${project.title}" (${project.id}):` : "No Creator projects yet.", checks.map((check) => `${check.label}: ${check.status} (${check.reason})`)) };
      }),
  );

  const readiness = async (id?: string): Promise<VideoReadinessData> => {
    const snapshot = await options.snapshot(id);
    const project = findProject(snapshot, id);
    const state = project ? await options.state.get(project.id) : {};
    const workflow = buildCreatorWorkflow(snapshot, { ...state, ...(project ? { projectId: project.id } : {}) });
    // Without a project there is nothing to approve or publish.
    const data: VideoReadinessData = {
      kind: "video-readiness",
      ...base(snapshot),
      projects: projectOptions(snapshot),
      workflow: project ? workflow : { ...workflow, actions: [] },
      ...(project ? { projectId: project.id, projectTitle: project.title } : {}),
    };
    return data;
  };

  registerAppTool(
    server,
    "creator_video_readiness",
    {
      title: "Video readiness review",
      description: "The video readiness workflow for a project: pipeline, package checks, approval and publish state. A human approves the package from the rendered view before it can be published.",
      inputSchema: optionalProject,
      annotations: readOnly,
      _meta: both("videoReadiness"),
    },
    async ({ projectId: id }) =>
      result(async () => {
        const data = await readiness(id);
        const next = data.workflow.actions?.[0]?.title ?? "none";
        return { data, text: data.projectId ? `Video readiness for "${data.projectTitle}" (${data.projectId}): stage ${data.workflow.currentStage}, next action: ${next}.` : "No Creator projects to review." };
      }),
  );

  // App-only: the agent cannot approve its own publish; T3 hides this tool from
  // the model and only lets the view call it.
  server.registerTool(
    "creator_video_approve",
    {
      title: "Approve creator package",
      description: "Record human approval of a video project's package for publishing.",
      inputSchema: z.object({ projectId }),
      annotations: { idempotentHint: true, openWorldHint: true },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ projectId: id }) =>
      result(async () => {
        const snapshot = await options.snapshot(id);
        findProject(snapshot, id);
        const state = await options.state.get(id);
        await options.state.save(id, { ...state, approved: true });
        return { data: { projectId: id, approved: true }, text: `Creator package approved for ${id}.` };
      }),
  );

  registerAppTool(
    server,
    "creator_video_publish",
    {
      title: "Publish or schedule video",
      description: "Publish or schedule an approved video project through the configured Creator publish command. Fails unless a human approved the package in the video readiness view.",
      inputSchema: z.object({ projectId }),
      // Publishing to YouTube is irreversible and, as in v1, only a human
      // clicking Publish in the readiness view may do it.
      annotations: { destructiveHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: VIEWS.videoReadiness.uri, visibility: ["app"] } },
    },
    async ({ projectId: id }) =>
      result(async () => {
        const state = await options.state.get(id);
        if (!state.approved) throw new Error("Approve the creator package in the video readiness view before publishing.");
        if (state.published) throw new Error(`Creator project ${id} was already published or scheduled.`);
        const published = publishResult(await options.publish(id));
        await options.state.save(id, { ...state, approved: true, published: true });
        const data = await readiness(id);
        return { data: { ...data, published }, text: `Creator ${published.status} ${id}${published.publishAt ? ` for ${published.publishAt}` : ""}.` };
      }),
  );

  return server;
}

// Only a status the publish command actually reports counts as success.
function publishResult(value: unknown): PublishResult {
  const record = (value && typeof value === "object" ? value : {}) as { status?: unknown; publishAt?: unknown };
  if (record.status !== "published" && record.status !== "scheduled") throw new Error("Creator publish command did not confirm a published or scheduled status.");
  return { status: record.status, ...(typeof record.publishAt === "string" ? { publishAt: record.publishAt } : {}) };
}

// An explicit id must exist; without one the newest project is used, as in Creator.
function findProject(snapshot: CreatorSnapshot, id?: string) {
  if (!id) return snapshot.projects[0];
  const project = snapshot.projects.find((candidate) => candidate.id === id);
  if (!project) throw new Error(`Creator project ${id} was not found.`);
  return project;
}

const projectOptions = (snapshot: CreatorSnapshot) => snapshot.projects.map((project) => ({ id: project.id, title: project.title, status: project.status }));

const lines = (head: string, rows: readonly string[]) => [head, ...rows.map((row) => `- ${row}`)].join("\n");

async function result(run: () => Promise<{ data: unknown; text: string }>): Promise<CallToolResult> {
  try {
    const { data, text } = await run();
    return { content: [{ type: "text", text }], structuredContent: data as Record<string, unknown> };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
