export type CreatorIdea = { id: string; title: string; rung: "spark" | "proof" | "package" | "production" | "publish" | "unknown" };
export type CreatorProject = { id: string; title: string; status: string; format: "long" | "short" | "stream" | "unknown" };
export type CreatorPublishItem = { id: string; title: string; status: string; publishAt?: string };
export type CreatorSponsor = { id: string; name: string; status: string; disclosure?: string };
export type CreatorSnapshot = { channel: { name: string; subscribers?: number }; ideas: readonly CreatorIdea[]; projects: readonly CreatorProject[]; publishQueue: readonly CreatorPublishItem[]; analytics?: { ctr: number | null; views?: number; averageViewDurationSeconds?: number }; sponsors: readonly CreatorSponsor[] };
export type SurfaceCard = { kind: "metric" | "list" | "notice"; id: string; title: string; value?: string; message?: string; items?: readonly { id: string; title: string; detail?: string; status?: "neutral" | "positive" | "warning" | "negative" }[]; status?: "neutral" | "positive" | "warning" | "negative" };
export type SurfaceModel = { pluginId: string; navigationId: string; title: string; refreshedAt: string; cards: readonly SurfaceCard[] };
export type CreatorWorkflowState = { readonly approved?: boolean; readonly published?: boolean; };
export type CreatorWorkflowModel = { readonly pluginId: string; readonly workflowId: string; readonly title: string; readonly currentStage: "inspect" | "context" | "propose" | "review" | "approve" | "execute" | "verify" | "respond"; readonly refreshedAt: string; readonly steps: readonly { id: string; stage: CreatorWorkflowModel["currentStage"]; title: string; state: "pending" | "active" | "completed" | "blocked" | "failed"; detail?: string }[]; readonly evidence?: readonly { id: string; title: string; kind: "check" | "artifact" | "diff" | "log" | "link"; status: "neutral" | "positive" | "warning" | "negative"; detail?: string }[]; readonly actions?: readonly { id: string; title: string; tone?: "primary" | "secondary" | "destructive" }[] };
export type CommandRunner = (command: readonly string[]) => Promise<unknown>;

function rung(value: unknown): CreatorIdea["rung"] { return ["spark", "proof", "package", "production", "publish"].includes(String(value)) ? value as CreatorIdea["rung"] : "unknown"; }
function format(value: unknown): CreatorProject["format"] { return ["long", "short", "stream"].includes(String(value)) ? value as CreatorProject["format"] : "unknown"; }
export function normalizeCreatorSnapshot(value: any): CreatorSnapshot {
  return {
    channel: { name: String(value?.channel?.name ?? value?.channelName ?? "Creator"), ...(typeof value?.channel?.subscribers === "number" ? { subscribers: value.channel.subscribers } : {}) },
    ideas: Array.isArray(value?.ideas) ? value.ideas.map((idea: any) => ({ id: String(idea.id), title: String(idea.title ?? idea.name ?? idea.id), rung: rung(idea.rung ?? idea.stage) })) : [],
    projects: Array.isArray(value?.projects) ? value.projects.map((project: any) => ({ id: String(project.id), title: String(project.title ?? project.name ?? project.id), status: String(project.status ?? "unknown"), format: format(project.format) })) : [],
    publishQueue: Array.isArray(value?.publishQueue) ? value.publishQueue.map((item: any) => ({ id: String(item.id), title: String(item.title ?? item.name ?? item.id), status: String(item.status ?? "unknown"), ...(typeof item.publishAt === "string" ? { publishAt: item.publishAt } : {}) })) : [],
    analytics: value?.analytics ? { ctr: typeof value.analytics.ctr === "number" ? value.analytics.ctr : null, ...(typeof value.analytics.views === "number" ? { views: value.analytics.views } : {}), ...(typeof value.analytics.averageViewDurationSeconds === "number" ? { averageViewDurationSeconds: value.analytics.averageViewDurationSeconds } : {}) } : undefined,
    sponsors: Array.isArray(value?.sponsors) ? value.sponsors.map((sponsor: any) => ({ id: String(sponsor.id), name: String(sponsor.name ?? sponsor.id), status: String(sponsor.status ?? "unknown"), ...(typeof sponsor.disclosure === "string" ? { disclosure: sponsor.disclosure } : {}) })) : [],
  };
}

export function buildSurfaceModel(snapshot: CreatorSnapshot, navigationId = "creator.command-center"): SurfaceModel {
  return { pluginId: "com.t3code.creator", navigationId, title: "Creator command center", refreshedAt: new Date().toISOString(), cards: [
    { kind: "metric", id: "ideas", title: "Ideas in ladder", value: `${snapshot.ideas.length}`, status: snapshot.ideas.length > 0 ? "positive" : "warning" },
    { kind: "metric", id: "in-production", title: "In production", value: `${snapshot.projects.filter((project) => !["published", "archived"].includes(project.status)).length}` },
    { kind: "metric", id: "publish-queue", title: "Publish queue", value: `${snapshot.publishQueue.length}`, status: snapshot.publishQueue.length > 0 ? "positive" : "warning" },
    { kind: "list", id: "next-actions", title: "Next actions", items: [...snapshot.publishQueue.slice(0, 4).map((item) => ({ id: item.id, title: `Publish ${item.title}`, detail: item.publishAt ?? item.status, status: item.status === "ready" ? "positive" as const : "warning" as const })), ...snapshot.ideas.filter((idea) => idea.rung === "spark" || idea.rung === "proof").slice(0, 4).map((idea) => ({ id: idea.id, title: `Advance ${idea.title}`, detail: `${idea.rung} → package`, status: "warning" as const }))] },
    { kind: "notice", id: "human-in-loop", title: "Human review stays in control", message: "Creator prepares packages, drafts, and publish checks; final editorial and publishing decisions remain explicit." },
  ] };
}

export function buildCreatorWorkflow(snapshot: CreatorSnapshot, state: CreatorWorkflowState = {}): CreatorWorkflowModel {
  const project = snapshot.projects[0];
  const ready = Boolean(project && snapshot.publishQueue.some((item) => item.id === project.id && ["ready", "scheduled"].includes(item.status)));
  const steps = [
    { id: "inspect", stage: "inspect" as const, title: "Inspect creator pipeline", state: "completed" as const, detail: `${snapshot.ideas.length} ideas · ${snapshot.projects.length} projects` },
    { id: "context", stage: "context" as const, title: "Collect channel and audience context", state: "completed" as const, detail: snapshot.analytics?.views === undefined ? "No analytics supplied" : `${snapshot.analytics.views} views` },
    { id: "propose", stage: "propose" as const, title: "Prepare title, thumbnail, and platform package", state: "completed" as const },
    { id: "review", stage: "review" as const, title: "Review creator package", state: state.approved ? "completed" as const : "active" as const },
    { id: "approve", stage: "approve" as const, title: "Approve package for publishing", state: state.approved ? "completed" as const : "pending" as const },
    { id: "execute", stage: "execute" as const, title: "Publish or schedule video", state: state.published ? "completed" as const : state.approved ? "active" as const : "pending" as const },
    { id: "verify", stage: "verify" as const, title: "Verify publish and distribution checks", state: state.published ? "completed" as const : "pending" as const, detail: ready ? "Publish queue is ready" : "Title, thumbnail, or publish readiness needs review" },
    { id: "respond", stage: "respond" as const, title: "Capture audience learning", state: "pending" as const },
  ];
  return { pluginId: "com.t3code.creator", workflowId: "creator.video-readiness", title: "Video readiness review", currentStage: state.published ? "verify" : state.approved ? "execute" : "review", refreshedAt: new Date().toISOString(), steps, evidence: [{ id: "package-readiness", title: "Package readiness", kind: "check", status: ready ? "positive" : "warning", detail: ready ? "A publish-ready item is in the queue" : "No publish-ready item is linked to the active project" }], actions: state.published ? [] : state.approved ? [{ id: "publish", title: "Publish or schedule video", tone: "primary" }] : [{ id: "approve", title: "Approve creator package", tone: "primary" }] };
}

export function createCreatorClient(input: { workspaceId: string; run: CommandRunner }) { return { async snapshot() { return normalizeCreatorSnapshot(await input.run(["video_creator_snapshot", "--workspace", input.workspaceId, "--json"])); } }; }
