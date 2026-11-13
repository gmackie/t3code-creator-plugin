import { STYLES, type ViewKind } from "./render.ts";

// One ui:// resource per panel. They share one bundled client, which reads
// data-view to know which tool refreshes it.
export const VIEWS = {
  commandCenter: { uri: "ui://creator/command-center.html", title: "Creator command center", tool: "creator_command_center", kind: "command-center" },
  publishQueue: { uri: "ui://creator/publish-queue.html", title: "Publish queue", tool: "creator_publish_queue", kind: "publish-queue" },
  contentCalendar: { uri: "ui://creator/content-calendar.html", title: "Content calendar", tool: "creator_content_calendar", kind: "content-calendar" },
  analytics: { uri: "ui://creator/analytics.html", title: "Creator analytics", tool: "creator_analytics", kind: "analytics" },
  ideaLadder: { uri: "ui://creator/idea-ladder.html", title: "Idea ladder", tool: "creator_idea_ladder", kind: "idea-ladder" },
  sponsors: { uri: "ui://creator/sponsor-deal-room.html", title: "Sponsor deal room", tool: "creator_sponsor_deal_room", kind: "sponsor-deal-room" },
  packageReview: { uri: "ui://creator/package-review.html", title: "Package review", tool: "creator_package_review", kind: "package-review" },
  videoReadiness: { uri: "ui://creator/video-readiness.html", title: "Video readiness review", tool: "creator_video_readiness", kind: "video-readiness" },
} as const satisfies Record<string, { uri: string; title: string; tool: string; kind: ViewKind }>;

export type ViewName = keyof typeof VIEWS;

let script: Promise<string> | undefined;

// Views are single self-contained HTML documents: T3 snapshots the resource
// once and serves it into a sandboxed iframe with connect-src 'none', so the
// script is bundled and inlined rather than loaded from anywhere.
export async function viewHtml(name: ViewName): Promise<string> {
  script ??= bundle();
  const view = VIEWS[name];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title}</title>
<style>${STYLES}</style>
</head>
<body>
<main id="app" aria-live="polite" data-view="${view.kind}" data-tool="${view.tool}">Loading…</main>
<script type="module">${await script}</script>
</body>
</html>`;
}

async function bundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [new URL("app.client.ts", import.meta.url).pathname],
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!result.success) throw new AggregateError(result.logs, "failed to bundle app.client.ts");
  return (await result.outputs[0]!.text()).replaceAll("</script", "<\\/script");
}
